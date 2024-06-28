
## Web REPL Server

This connection method requires `ViperIDE` to establish a direct network connection to your MicroPython board.
The board acts as a web server, so usually you need to be connected to the same local network.

> [!IMPORTANT]
> It uses an **unsecure** WebSocket connection, which is not available for secure websites like ViperIDE.
> To workaround this, ViperIDE will also be served from the device on the local network (and your browser will be automatically redirected to the device).
> **If you'd like to connect to your device over the internet, consider using a [Secure WebSocket Relay](./Web-REPL-Relay.md)**

#### 1. Connect [ViperIDE](https://viper-ide.org) to your device using USB

#### 2. In the left panel: `Package Manager` -> install `viper-tools`

#### 3. In your `main.py`

```py
# Set your WiFi network credentials
WIFI_SSID='WiFi_SSID'
WIFI_PASS='WiFi_Password'

# Password will be required to access the REPL (4-8 symbols)
REPL_PASS='1234'

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
        print('Error: Could not connect to WiFi!')

import web_repl
web_repl.start(password=REPL_PASS)
```

#### 4. Reset your device

In the terminal, you should see something like:

```log
WebREPL server started on http://192.168.1.123:8266/
```

#### 5. Connect ViperIDE to your device using `WebREPL`

Visit the specified link to open the IDE.

Alternatively, use WebREPL button in `ViperIDE` to connect to your device.

> [!NOTE]
> If it opens the original MicroPython WebREPL app, it means you're using the original `webrepl` package instead of the one included in `viper-tools`
