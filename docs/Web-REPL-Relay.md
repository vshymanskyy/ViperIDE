
## Web REPL + Secure WebSocket Relay

A `Secure WebSocket Relay` can be used to connect to your device over the internet (from anywhere in the world).

> [!WARNING]
> **🚧 This connection method is in development and not ready to use yet 🚧**

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

import web_repl
web_repl.start_client()
```

You can run your own relay server. In this case, please specify url:

```py
web_repl.start_client(url='wss://viper-ide.org/relay')
```

#### 4. Reset your device

In the terminal, you should see something like:

```log
WebREPL client started on https://viper-ide.org?webrepl=MYDEVICEID
```

#### 5. Connect ViperIDE to your device using `WebREPL`

Visit the specified link to open the IDE.

Alternatively, use WebREPL button in `ViperIDE` to connect to your device, use `wss://viper-ide.org/relay/MYDEVICEID`

