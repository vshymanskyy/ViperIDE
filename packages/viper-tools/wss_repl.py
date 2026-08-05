# REPL over a Secure WebSocket Relay
import network
import time
import os
import machine
import ws_client


def on_connect():
    pass


for _tid in [-1] + list(range(16, 0, -1)):
    try:
        timer_hb = machine.Timer(_tid)
        break
    except ValueError:
        pass

client_s = None
_url = None
_uid = None
_default_url = "wss://hub.viper-ide.org/relay"
_config_file = ".viper.json"
_uid_key = "uid"

try:
    import tls

    ssl_ctx = tls.SSLContext(tls.PROTOCOL_TLS_CLIENT)
    ssl_ctx.verify_mode = tls.CERT_NONE
    # ssl_ctx.load_verify_locations(...)
except Exception:
    ssl_ctx = None
    _default_url = _default_url.replace("wss://", "ws://")


def connect_wifi(ssid, password, timeout=15):
    sta = network.WLAN(network.STA_IF)
    if not sta.isconnected():
        print("Connecting to WiFi...")
        sta.active(True)
        sta.connect(ssid, password)
        t = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t) < timeout * 1000:
            if sta.isconnected():
                break
        else:
            print("Error: Could not connect to WiFi!")


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


def _format_uid(num):
    encoded = _curious_base24(num, 12)
    return encoded[0:4] + "-" + encoded[4:8] + "-" + encoded[8:12]


def _get_stable_uid():
    """Return a stable UID derived from machine.unique_id(), if available."""

    raw_uid = machine.unique_id()
    if not raw_uid:
        raise ValueError()

    # FNV-1a 64-bit hash. This mixes every byte of the hardware UID while
    # avoiding a dependency on hashlib, which may not exist on all targets.
    value = 0xCBF29CE484222325
    for byte in raw_uid:
        value ^= byte
        value = (value * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF

    return _format_uid(value)


def _get_random_uid():
    """Generate a random UID"""
    return _format_uid(int.from_bytes(os.urandom(8), "big"))

def _get_stored_uid():
    """Random UID stored it in the config file."""
    import json

    config = {}
    try:
        with open(_config_file) as f:
            config = json.load(f)
    except OSError:
        pass

    uid = config.get(_uid_key)

    if not uid:
        uid = _get_random_uid()
        config[_uid_key] = uid
        with open(_config_file, "w") as f:
            json.dump(config, f)
    return uid


def _hbeat(tmr):
    global client_s, _uid, _url
    if not _url:
        return

    try:
        client_s.ping()
    except Exception:
        try:
            _start(_uid, _url)
        except Exception:
            pass
    finally:
        timer_hb.init(mode=timer_hb.ONE_SHOT, period=50 * 1000, callback=_hbeat)


def _start(uid=None, url=_default_url):
    global client_s, timer_hb, _uid, _url
    _uid, _url = uid, url

    # Heartbeat / reconnect every 50 seconds
    timer_hb.init(mode=timer_hb.ONE_SHOT, period=50 * 1000, callback=_hbeat)

    client_s = ws_client.connect(url + "/new/" + uid, ssl=ssl_ctx)

    client_s._sock.setblocking(False)
    # Notify REPL on socket incoming data
    if hasattr(os, "dupterm_notify"):
        client_s.raw_sock.setsockopt(ws_client.socket.SOL_SOCKET, 20, os.dupterm_notify)
    os.dupterm(client_s)

    on_connect()


def start(uid=None, url=_default_url):
    if not uid:
        try:
            uid = _get_stable_uid()
        except Exception:
            try:
                uid = _get_stored_uid()
            except Exception:
                uid = _get_random_uid()
    try:
        _start(uid, url)
        if _url == _default_url:
            lnk = "https://viper-ide.org?wss=" + _uid
            print("IDE available on", lnk)
        else:
            lnk = url + "/" + _uid
            print("Remote REPL available on", lnk)
    except Exception:
        print("Unable to provide remote REPL, will retry periodically")


def stop():
    global client_s, timer_hb
    os.dupterm(None)
    if timer_hb:
        timer_hb.deinit()
    if client_s:
        client_s.close()
    timer_hb = None
    client_s = None
    _url = None
    _uid = None


def started():
    return _uid is not None
