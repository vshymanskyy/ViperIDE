
## Web REPL + Secure WebSocket Relay

A `Secure WebSocket Relay` can be used to connect to your device over the internet (from anywhere in the world).

> [!WARNING]
> **🚧 THIS IS EXPERIMENTAL, BEWARE OF BUGS 🚧**

#### 1. Connect ViperIDE to your device using USB

#### 2. In the left panel: `Package Manager` -> install `viper-tools`

#### 3. In your `main.py`

```py
# Set your WiFi network credentials
WIFI_SSID='WiFi_SSID'
WIFI_PASS='WiFi_Password'

import network, time
sta = network.WLAN(network.STA_IF)
if not sta.isconnected():
    print('Connecting to WiFi...')
    sta.active(True)
    sta.connect(WIFI_SSID, WIFI_PASS)
    t = time.ticks_ms()
    while time.ticks_diff(time.ticks_ms(), t) < 10000:
        if sta.isconnected():
            break
    else:
        print("Error: Could not connect to WiFi!")

import wss_repl
wss_repl.start()
```

The device will generate a new random ID on every boot. Most likely, you'll want to have a fixed ID.  
This is easy, just take the auto-generated ID and put it into your code like this:

```py
wss_repl.start(uid='YOUR-DEVICE-UID')
```

#### 4. Reset your device

In the terminal, you should see something like:

```log
Secure WebREPL available on https://viper-ide.org?relay=YOUR-DEVICE-UID
```

#### 5. Connect ViperIDE to your device using `WebREPL`

Visit the specified link to open the IDE.

---

## Advanced: Running your own WebSocket relay server

If you're running a [relay server](../src/websocket_relay.js), please specify the URL:

```py
wss_repl.start(url='wss://your-server-url')
```

1. Use WebREPL button in `ViperIDE` to connect to your device
2. Your device address will look like this: `wss://your-server-url/YOUR-DEVICE-UID`
