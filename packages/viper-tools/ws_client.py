"""
WebSocket client for MicroPython
Based very heavily on
https://github.com/aaugustin/websockets/blob/master/websockets/client.py
"""

import io
import binascii
import random
import re
import struct
import socket
from collections import namedtuple

# Opcodes
OP_CONT = const(0x0)
OP_TEXT = const(0x1)
OP_BYTES = const(0x2)
OP_CLOSE = const(0x8)
OP_PING = const(0x9)
OP_PONG = const(0xa)

# Close codes
CLOSE_OK = const(1000)
CLOSE_GOING_AWAY = const(1001)
CLOSE_PROTOCOL_ERROR = const(1002)
CLOSE_DATA_NOT_SUPPORTED = const(1003)
CLOSE_BAD_DATA = const(1007)
CLOSE_POLICY_VIOLATION = const(1008)
CLOSE_TOO_BIG = const(1009)
CLOSE_MISSING_EXTN = const(1010)
CLOSE_BAD_CONDITION = const(1011)

URL_RE = re.compile(r'([A-Za-z]+)://([A-Za-z0-9\-\.]+)(?:\:([0-9]+))?(/.+)?')
URI = namedtuple('URI', ('scheme', 'hostname', 'port', 'path'))

def urlparse(uri):
    match = URL_RE.match(uri)
    if match:
        schema = match.group(1)
        port = match.group(3)
        if port:
            port = int(port)
        else:
            port = { "ws": 80, "wss": 443, "http": 80, "https": 443 }[schema]
        return URI(schema, match.group(2), port, match.group(4))
    else:
        raise ValueError("Invalid URL: %s" % uri)

class WebSocket(io.IOBase):
    is_client = False

    def __init__(self, sock):
        self._sock = sock
        self.open = True
        self._rbuff = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def settimeout(self, timeout):
        self._sock.settimeout(timeout)

    def read_frame(self, max_size=None):
        fh = self._sock.read(2)
        if not fh:
            return (None, None, None)
        # Frame header
        byte1, byte2 = struct.unpack('!BB', fh)

        # Byte 1: FIN(1) _(1) _(1) _(1) OPCODE(4)
        fin = bool(byte1 & 0x80)
        opcode = byte1 & 0x0f

        # Byte 2: MASK(1) LENGTH(7)
        mask = bool(byte2 & (1 << 7))
        length = byte2 & 0x7f

        if length == 126:  # Magic number, length header is 2 bytes
            length, = struct.unpack('!H', self._sock.read(2))
        elif length == 127:  # Magic number, length header is 8 bytes
            length, = struct.unpack('!Q', self._sock.read(8))

        if mask:  # Mask is 4 bytes
            mask_bits = self._sock.read(4)

        try:
            data = self._sock.read(length)
        except MemoryError:
            # We can't receive this many bytes, close the socket
            self.close(code=CLOSE_TOO_BIG)
            return True, OP_CLOSE, None

        if mask:
            data = bytes(b ^ mask_bits[i % 4]
                         for i, b in enumerate(data))

        return fin, opcode, data

    def write_frame(self, opcode, data=b''):
        fin = True
        mask = self.is_client  # messages sent by client are masked

        length = len(data)

        # Frame header
        # Byte 1: FIN(1) _(1) _(1) _(1) OPCODE(4)
        byte1 = 0x80 if fin else 0
        byte1 |= opcode

        # Byte 2: MASK(1) LENGTH(7)
        byte2 = 0x80 if mask else 0

        if length < 126:  # 126 is magic value to use 2-byte length header
            byte2 |= length
            self._sock.write(struct.pack('!BB', byte1, byte2))

        elif length < (1 << 16):  # Length fits in 2-bytes
            byte2 |= 126  # Magic code
            self._sock.write(struct.pack('!BBH', byte1, byte2, length))

        elif length < (1 << 64):
            byte2 |= 127  # Magic code
            self._sock.write(struct.pack('!BBQ', byte1, byte2, length))

        else:
            raise ValueError()

        if mask:  # Mask is 4 bytes
            mask_bits = struct.pack('!I', random.getrandbits(32))
            self._sock.write(mask_bits)

            data = bytes(b ^ mask_bits[i % 4]
                         for i, b in enumerate(data))

        self._sock.write(data)

    def recv(self):
        while self.open:
            try:
                fin, opcode, data = self.read_frame()
                if opcode is None:
                    return None
            except ValueError:
                self._close()
                return

            if not fin:
                raise NotImplementedError()

            if opcode == OP_TEXT:
                return data.decode('utf-8')
            elif opcode == OP_BYTES:
                return data
            elif opcode == OP_CLOSE:
                self._close()
                return
            elif opcode == OP_PONG:
                # Ignore this frame, keep waiting for a data frame
                continue
            elif opcode == OP_PING:
                # We need to send a pong frame
                self.write_frame(OP_PONG, data)
                # And then wait to receive
                continue
            elif opcode == OP_CONT:
                # This is a continuation of a previous frame
                raise NotImplementedError(opcode)
            else:
                raise ValueError(opcode)

    def ping(self, data=b''):
        assert self.open
        self.write_frame(OP_PING, data)

    def send(self, buf):
        assert self.open
        if isinstance(buf, str):
            opcode = OP_TEXT
            buf = buf.encode('utf-8')
        elif isinstance(buf, (bytes, bytearray)):
            opcode = OP_BYTES
        else:
            print(repr(buf))
            raise TypeError()

        self.write_frame(opcode, buf)

    def write(self, buf):
        self.send(buf)
        return len(buf)

    def readinto(self, buf):
        if not self._rbuff or not len(self._rbuff):
            self._rbuff = self.recv()
            if isinstance(self._rbuff, str):
                self._rbuff = self._rbuff.encode()
        if self._rbuff:
            n = min(len(buf), len(self._rbuff))
            #print(repr(self._rbuff))
            buf[:n] = self._rbuff[:n]
            self._rbuff = self._rbuff[n:]
            return n
        return None

    def ioctl(self, kind, arg):
        if kind == 4:
            self.close()
            return 0
        return -1

    def close(self, code=CLOSE_OK, reason=''):

        if not self.open:
            return

        buf = struct.pack('!H', code) + reason.encode('utf-8')

        self.write_frame(OP_CLOSE, buf)
        self._close()

    def _close(self):
        self.open = False
        self._sock.close()

class WebSocketClient(WebSocket):
    is_client = True

def connect(uri, ssl=None):
    """
    Connect a websocket.
    """

    uri = urlparse(uri)
    assert uri

    addr = socket.getaddrinfo(uri.hostname, uri.port)

    raw = socket.socket()
    raw.connect(addr[0][-1])
    if uri.scheme == 'wss':
        sock = ssl.wrap_socket(raw, server_hostname=uri.hostname)
    else:
        sock = raw

    def send_header(header, *args):
        sock.write(header % args + '\r\n')

    # Sec-WebSocket-Key is 16 bytes of random base64 encoded
    key = binascii.b2a_base64(bytes(random.getrandbits(8)
                                    for _ in range(16)))[:-1]

    send_header(b'GET %s HTTP/1.1', uri.path or '/')
    send_header(b'Host: %s:%s', uri.hostname, uri.port)
    send_header(b'Connection: Upgrade')
    send_header(b'Upgrade: websocket')
    send_header(b'Sec-WebSocket-Key: %s', key)
    send_header(b'Sec-WebSocket-Version: 13')
    send_header(b'Origin: http://localhost')
    send_header(b'')

    header = sock.readline()[:-2]
    assert header == b'HTTP/1.1 101 Switching Protocols', header

    # We don't (currently) need these headers
    # FIXME: should we check the return key?
    while header:
        header = sock.readline()[:-2]

    ws = WebSocketClient(sock)
    ws.raw_sock = raw
    return ws
