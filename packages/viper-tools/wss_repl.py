# REPL over a Secure WebSocket Relay

import os, ws_client, socket

def _curious_base24(n, length):
    # Base 24 alphabet avoiding visually similar or inappropriate characters
    alphabet = "0W8N4Y1HP5DF9K6JM3C2XA7R"
    base = 24
    res = ""
    prev = None
    while len(res) < length:
        c = alphabet[n % base]
        if c == prev:
            c = alphabet[(n + 1) % base]
        prev = c
        res += c
        n //= base
    return res

def generate_uid():
    num = os.urandom(16)
    num = int.from_bytes(num, 'big')
    return _curious_base24(num, 10)

def stop():
    global client_s
    os.dupterm(None)
    if client_s:
        client_s.close()

def start(uid=None, url="ws://vsh.pp.ua/relay"):
    # TODO: use Secure WebSocket
    global client_s
    if not uid:
        # TODO: store the UID in device configuration
        uid = generate_uid()
    client_s = ws_client.connect(url + "/new/" + uid)

    client_s._sock.setblocking(False)
    # notify REPL on socket incoming data (ESP32/ESP8266-only)
    if hasattr(os, "dupterm_notify"):
        client_s._sock.setsockopt(socket.SOL_SOCKET, 20, os.dupterm_notify)
    os.dupterm(client_s)

    print('WebREPL available on', url + "/" + uid)
