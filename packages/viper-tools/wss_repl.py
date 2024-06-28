# REPL over a Secure WebSocket Relay

import os, ws_client, socket

try:
    import tls
    ssl_ctx = tls.SSLContext(tls.PROTOCOL_TLS_CLIENT)
    ssl_ctx.verify_mode = tls.CERT_NONE
    #ssl_ctx.load_verify_locations(...)
    _default_url = "wss://vsh.pp.ua/relay"
except:
    ssl_ctx = None
    _default_url = "ws://vsh.pp.ua/relay"

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
    num = int.from_bytes(os.urandom(10), "big")
    num = _curious_base24(num, 16)
    return num[0:4]+"-"+num[4:8]+"-"+num[8:12]

def stop():
    global client_s
    os.dupterm(None)
    if client_s:
        client_s.close()

def start(uid=None, url=_default_url):
    global client_s
    if not uid:
        # TODO: store the UID in device configuration
        uid = generate_uid()
    client_s = ws_client.connect(url + "/new/" + uid, ssl=ssl_ctx)

    client_s._sock.setblocking(False)
    # Notify REPL on socket incoming data
    if hasattr(os, "dupterm_notify"):
        client_s.raw_sock.setsockopt(socket.SOL_SOCKET, 20, os.dupterm_notify)
    os.dupterm(client_s)

    sec = "Secure" if url.startswith("wss:") else "Insecure"

    if url == _default_url:
        url = "https://viper-ide.org?relay=" + uid
    else:
        url += "/" + uid

    print(sec, "WebREPL available on", url)
