/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { SOFT_RESET_BANNER } from './rawmode.js'

/*
 * Watches the free-running terminal stream for two things the app cannot ask the
 * board about without disturbing it: a soft reboot announcing itself, and a busy
 * board coming back to the friendly REPL.
 *
 * It is fed only the traffic that reaches the terminal - raw-mode transactions swap
 * the receive callback away, so protocol chatter never passes through here.
 */
export class ReplMonitor {
    constructor({ onSoftReset, onPromptSettled, settleMs = 500, tailSize = 256 }) {
        this.onSoftReset = onSoftReset
        this.onPromptSettled = onPromptSettled
        this.settleMs = settleMs
        this.tailSize = tailSize
        this.watchPrompt = false
        this.tail = ''
        this.settleTimer = null
        this.ignoreBannerUntil = 0
    }

    /*
     * Ctrl-B makes a board print the same greeting it prints after a restart, so
     * asking for one means the next is not news. Time-boxed: a board that really
     * does restart a moment later still has to be noticed.
     */
    expectBanner(withinMs = 3000) {
        this.ignoreBannerUntil = Date.now() + withinMs
    }

    feed(data) {
        this.tail = (this.tail + data).slice(-this.tailSize)

        if (SOFT_RESET_BANNER.test(this.tail)) {
            /* Cleared so one banner fires exactly once, however the chunks fall. */
            this.tail = ''
            this._cancelSettle()
            if (Date.now() < this.ignoreBannerUntil) {
                this.ignoreBannerUntil = 0
                return
            }
            this.onSoftReset()
            return
        }

        if (!this.watchPrompt) { return }

        /* A prompt is only trusted once the board has been quiet on it for a while:
           '>>> ' scrolling past mid-output (or echoed back from typing) is always
           followed by more bytes, which restart the wait. */
        this._cancelSettle()
        if (this.tail.endsWith('>>> ')) {
            this.settleTimer = setTimeout(() => {
                this.settleTimer = null
                this.onPromptSettled()
            }, this.settleMs)
        }
    }

    setWatchPrompt(on) {
        this.watchPrompt = on
        if (!on) { this._cancelSettle() }
    }

    reset() {
        this.tail = ''
        this.ignoreBannerUntil = 0
        this._cancelSettle()
    }

    _cancelSettle() {
        if (this.settleTimer) {
            clearTimeout(this.settleTimer)
            this.settleTimer = null
        }
    }
}
