
## WEB REPL

In your `boot.py`:

```py
WIFI_SSID='WiFi-SSID'
WIFI_PASS='WiFi-Password'

REPL_PASS='1234'

import web_repl
web_repl.start(password=REPL_PASS)

import network
sta = network.WLAN(network.STA_IF)
if not sta.isconnected():
    print('Connecting to WiFi...')
    sta.active(True)
    sta.connect(WIFI_SSID, WIFI_PASS)
    while not sta.isconnected():
        pass
```

In the terminal, you should see:

```log
WebREPL server started on http://192.168.20.125:8266/
```

Visit the specified link to open the `ViperIDE`

## BLE REPL

In your `boot.py`:

```py
import ble_repl
ble_repl.start()
```

Use Bluetooth button in `ViperIDE` to connect to your device.

