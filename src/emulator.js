/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { MicroPythonWASM, SYSTEM_DIRS } from './transports/vm.js'
import { loadVFS } from './python_utils.js'
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript/micropython.mjs'
import i18next from 'i18next'

export { MicroPythonWASM, SYSTEM_DIRS }

const T = i18next.t.bind(i18next)

function getDefaultMainPy() { return `\
# ViperIDE - MicroPython Web IDE
# Read more: https://github.com/vshymanskyy/ViperIDE

# 🚧 This is an experimental virtual device 🚧
# It runs the official MicroPython WASM port directly in your browser
# Most things work: you can edit and run files, use the Terminal, install packages, etc.
# WARNING: if your script takes a long time to run, the browser will busy-wait

def main():
    colors = [
        "\\033[31m", "\\033[32m", "\\033[33m", "\\033[34m",
        "\\033[35m", "\\033[36m", "\\033[37m",
    ]
    reset = "\\033[0m"

    text = "  ${T('example.hello', 'Привіт')} MicroPython! 𓆙"

    # ${T('example.comment-colors', 'Print each letter with a different color')}
    print("=" * 32)
    for i, char in enumerate(text):
        color = colors[i % len(colors)]
        print(color + char, end="")
    print(reset)
    print("=" * 32)

if __name__ == "__main__":
    main()
`
}

/**
 * Create a MicroPythonWASM transport configured for the browser:
 * explicit .wasm URL, and initial FS populated with example files.
 */
export function createBrowserVM() {
    return new MicroPythonWASM(loadMicroPython, {
        wasmURL: `${VIPER_IDE_BASE_URL}/assets/micropython.wasm`,
        async populateFS(mp) {
            mp.FS.writeFile('/main.py', getDefaultMainPy())
            await loadVFS(mp, `${VIPER_IDE_BASE_URL}/assets/vm_vfs.tar.gz`)
        },
    })
}
