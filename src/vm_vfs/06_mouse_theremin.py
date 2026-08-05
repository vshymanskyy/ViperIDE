"""Open a new window and turn pointer position into pitch and volume."""

import js


def open_example_window(title, width=820, height=500):
    popup = js.window.open(
        "about:blank",
        "_blank",
        f"popup=yes,width={width},height={height},resizable=yes,scrollbars=yes",
    )
    if popup is None:
        raise RuntimeError("Popup blocked. Allow popups for this page and run again.")
    popup.document.title = title
    popup.document.body.innerHTML = ""
    popup.document.body.style.cssText = (
        "margin:0;padding:24px;background:#111827;display:grid;place-items:center;"
        "min-height:100vh;box-sizing:border-box"
    )
    return popup


window = open_example_window("MicroPython Mouse Theremin")
document = window.document
pad = document.createElement("div")
pad.textContent = "Click to enable, then move the pointer ↔ pitch / ↕ volume"
pad.style.cssText = (
    "width:min(90vw,700px);height:320px;display:grid;place-items:center;"
    "border-radius:20px;user-select:none;cursor:crosshair;color:white;"
    "font:20px system-ui;text-align:center;padding:20px;box-sizing:border-box;"
    "background:linear-gradient(135deg,#6d28d9,#0891b2)"
)
document.body.appendChild(pad)
state = {"context": None, "osc": None, "gain": None}


def enable_audio(event):
    if state["context"] is not None:
        state["context"].resume()
        return

    try:
        AudioContext = window.AudioContext
    except Exception:
        AudioContext = window.webkitAudioContext

    context = AudioContext.new()
    oscillator = context.createOscillator()
    gain = context.createGain()

    oscillator.type = "sine"
    gain.gain.value = 0.0
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()

    state["context"] = context
    state["osc"] = oscillator
    state["gain"] = gain
    pad.textContent = "Move around — release pointer to mute"


def play(event):
    enable_audio(event)
    rect = pad.getBoundingClientRect()
    x = max(0.0, min(1.0, (event.clientX - rect.left) / rect.width))
    y = max(0.0, min(1.0, (event.clientY - rect.top) / rect.height))

    frequency = 110.0 * (2.0 ** (4.0 * x))
    volume = (1.0 - y) * 0.18

    now = state["context"].currentTime
    state["osc"].frequency.setTargetAtTime(frequency, now, 0.015)
    state["gain"].gain.setTargetAtTime(volume, now, 0.015)
    pad.textContent = f"{frequency:.0f} Hz"


def mute(event):
    if state["context"] is not None:
        state["gain"].gain.setTargetAtTime(0.0, state["context"].currentTime, 0.025)


pad.addEventListener("pointerdown", play)
pad.addEventListener("pointermove", play)
pad.addEventListener("pointerup", mute)
pad.addEventListener("pointerleave", mute)
theremin_handlers = [enable_audio, play, mute]
