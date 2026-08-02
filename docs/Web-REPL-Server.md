
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
import web_repl

# Set your WiFi network credentials
web_repl.connect_wifi('WiFi_SSID', 'WiFi_Password')

# Password will be required to access the REPL (4-8 symbols)
web_repl.start(password='1234')
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
