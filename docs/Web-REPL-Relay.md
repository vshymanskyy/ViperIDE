
## Web REPL + Secure WebSocket Relay

A `Secure WebSocket Relay` can be used to connect to your device over the internet (from anywhere in the world).

> [!WARNING]
> **🚧 THIS IS EXPERIMENTAL, BEWARE OF BUGS 🚧**

#### 1. Connect [ViperIDE](https://viper-ide.org) to your device using USB

#### 2. In the left panel: `Package Manager` -> install `viper-tools`

#### 3. In your `main.py`

```py
import wss_repl

# Set your WiFi network
wss_repl.connect_wifi('WiFi_SSID', 'WiFi_Password')

# Connect to the WebSocket server
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

If you're running a [relay server](../src/websocket_relay.cjs), please specify the URL:

```py
wss_repl.start(url='wss://your-server-url')
```

1. Use WebREPL button in `ViperIDE` to connect to your device
2. Your device address will look like this: `wss://your-server-url/YOUR-DEVICE-UID`
