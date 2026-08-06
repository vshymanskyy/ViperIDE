"""Open a new window containing a one-button reaction-time game."""

import random

import js


def open_example_window(title, width=560, height=440):
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


window = open_example_window("Reaction Test")
document = window.document
card = document.createElement("div")
card.style.cssText = (
    "width:min(420px,90vw);padding:24px;border-radius:18px;text-align:center;"
    "font:18px system-ui;background:#20242b;color:white;box-shadow:0 10px 35px #0005;"
    "box-sizing:border-box"
)
title = document.createElement("h2")
title.textContent = "⚡ Reaction Test"
button = document.createElement("button")
button.textContent = "Start"
button.style.cssText = (
    "font-size:22px;padding:16px 34px;border:0;border-radius:999px;"
    "cursor:pointer;background:#6ee7ff;color:#08212a"
)
message = document.createElement("p")
message.textContent = "Click Start, then wait for green."
card.append(title, button, message)
document.body.appendChild(card)

state = {"phase": "idle", "started_at": 0.0, "timer": None}


def arm():
    if window.closed or state["phase"] != "waiting":
        return
    state["phase"] = "ready"
    state["started_at"] = window.performance.now()
    card.style.background = "#147a3f"
    button.textContent = "CLICK!"


def on_click(event):
    phase = state["phase"]

    if phase == "idle":
        state["phase"] = "waiting"
        card.style.background = "#7d2b2b"
        button.textContent = "Wait…"
        message.textContent = "Do not click yet."
        state["timer"] = window.setTimeout(arm, random.randint(1200, 4200))

    elif phase == "waiting":
        if state["timer"] is not None:
            window.clearTimeout(state["timer"])
        state["phase"] = "idle"
        card.style.background = "#20242b"
        button.textContent = "Start again"
        message.textContent = "Too soon! 🐢"

    else:
        elapsed = int(window.performance.now() - state["started_at"])
        state["phase"] = "idle"
        card.style.background = "#20242b"
        button.textContent = "Play again"
        if elapsed < 200:
            rank = "cyborg reflexes 🤖"
        elif elapsed < 300:
            rank = "fast human ⚡"
        else:
            rank = "coffee recommended ☕"
        message.textContent = f"{elapsed} ms - {rank}"


button.addEventListener("click", on_click)
reaction_handlers = [on_click, arm]
