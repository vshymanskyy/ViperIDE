"""Open a new window with a clickable procedural-fireworks canvas."""

import math
import random

import js


def open_example_window(title, width=840, height=590):
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
        "margin:0;padding:24px;background:#02020b;color:white;display:grid;place-items:center;"
        "min-height:100vh;box-sizing:border-box;font-family:system-ui"
    )
    return popup


window = open_example_window("MicroPython Canvas Fireworks")
document = window.document
wrapper = document.createElement("div")
wrapper.style.cssText = "text-align:center"
heading = document.createElement("h2")
heading.textContent = "🎆 Click anywhere on the sky"
canvas = document.createElement("canvas")
canvas.width = 760
canvas.height = 440
canvas.style.cssText = (
    "width:min(95vw,760px);height:auto;background:#050511;border-radius:16px;"
    "box-shadow:0 12px 40px #0008;cursor:crosshair"
)
wrapper.append(heading, canvas)
document.body.appendChild(wrapper)
ctx = canvas.getContext("2d")
particles = []


def burst(x, y):
    hue = random.randint(0, 359)
    for _ in range(70):
        angle = random.random() * 2.0 * math.pi
        speed = 1.5 + random.random() * 4.5
        particles.append(
            {
                "x": x,
                "y": y,
                "vx": math.cos(angle) * speed,
                "vy": math.sin(angle) * speed,
                "life": random.randint(45, 85),
                "hue": hue + random.randint(-25, 25),
            }
        )


def on_click(event):
    rect = canvas.getBoundingClientRect()
    x = (event.clientX - rect.left) * canvas.width / rect.width
    y = (event.clientY - rect.top) * canvas.height / rect.height
    burst(x, y)


def frame(timestamp=0):
    if window.closed:
        return

    ctx.fillStyle = "rgba(5,5,17,0.18)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    alive = []
    for p in particles:
        p["x"] += p["vx"]
        p["y"] += p["vy"]
        p["vy"] += 0.045
        p["vx"] *= 0.992
        p["life"] -= 1

        if p["life"] > 0:
            alpha = min(1.0, p["life"] / 25)
            ctx.fillStyle = "hsla({},100%,65%,{})".format(p["hue"], alpha)
            ctx.fillRect(p["x"], p["y"], 3, 3)
            alive.append(p)

    particles[:] = alive
    window.requestAnimationFrame(frame)


canvas.addEventListener("click", on_click)
burst(canvas.width / 2, canvas.height / 2)
window.requestAnimationFrame(frame)
firework_handlers = [on_click, frame]
