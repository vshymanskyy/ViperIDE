
## Web REPL

#### 1. `Left panel` -> `Package Manager` -> install `viper-tools`

#### 2. In your `boot.py`:

```py
# Set your WiFi network credentials
WIFI_SSID='WiFi_SSID'
WIFI_PASS='WiFi_Password'

# Password will be required to access the REPL (4-8 symbols)
REPL_PASS='1234'

import network, time
elapsed_ms = lambda x: time.ticks_diff(time.ticks_ms(), x)
sta = network.WLAN(network.STA_IF)
if not sta.isconnected():
    print('Connecting to WiFi...')
    sta.active(True)
    sta.connect(WIFI_SSID, WIFI_PASS)
    t = time.ticks_ms()
    while not sta.isconnected() and elapsed_ms(t) < 15000:
        time.sleep(100)

import web_repl
web_repl.start(password=REPL_PASS)
```

In the terminal, you should see:

```log
WebREPL server started on http://192.168.20.125:8266/
```

Visit the specified link to open the IDE.

Alternatively, use WebREPL button in `ViperIDE` to connect to your device.
