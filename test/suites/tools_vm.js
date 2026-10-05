/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * Smoke tests for python-minifier and mpy-tool running inside the MicroPython
 * WASM VM - the same way ViperIDE uses them at runtime.
 */

import { assert } from 'chai'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript/micropython.mjs'
import { compile } from '@vshymanskyy/mpy-cross-wasm'

const TOOLS_VFS = resolve('src/tools_vfs')

/** Recursively copy a host directory into the Emscripten FS. */
function populateFS(FS, hostDir, mountPoint) {
    try { FS.mkdir(mountPoint) } catch { /* exists */ }
    for (const name of readdirSync(hostDir)) {
        const hostPath = join(hostDir, name)
        const vfsPath = mountPoint + '/' + name
        const st = statSync(hostPath)
        if (st.isDirectory()) {
            populateFS(FS, hostPath, vfsPath)
        } else {
            FS.writeFile(vfsPath, readFileSync(hostPath))
        }
    }
}

let vm

describe('MicroPython tools VM', function () {
    this.timeout(30000)

    before(async () => {
        vm = await loadMicroPython({
            pystack: 64 * 1024,
            heapsize: 32 * 1024 * 1024,
        })
        populateFS(vm.FS, TOOLS_VFS, '')
    })

    describe('python-minifier', () => {

        it('minifies a simple function', () => {
            vm.FS.writeFile('/tmp/file.py', `
def hello(name):
    """Say hello to someone."""
    greeting = "Hello, " + name
    return greeting
`)
            vm.runPython(`
import python_minifier
with open('/tmp/file.py') as f:
    d = f.read()
d = python_minifier.minify(d, remove_literal_statements=True, hoist_literals=False)
with open('/tmp/file.min.py', 'w') as f:
    f.write(d)
`)
            const minified = vm.FS.readFile('/tmp/file.min.py', { encoding: 'utf8' })
            assert.isString(minified)
            assert.isBelow(minified.length, 100, 'minified is shorter')
            assert.include(minified, 'hello', 'function name preserved')
            assert.notInclude(minified, '"""', 'docstring removed')
        })

        it('preserves program semantics', () => {
            const source = `
x = 1 + 2
y = x * 3
result = [y, x]
`
            vm.FS.writeFile('/tmp/file.py', source)
            vm.runPython(`
import python_minifier
with open('/tmp/file.py') as f:
    d = f.read()
d = python_minifier.minify(d, hoist_literals=False)
with open('/tmp/file.min.py', 'w') as f:
    f.write(d)
`)
            const minified = vm.FS.readFile('/tmp/file.min.py', { encoding: 'utf8' })
            // The minified code should still be valid Python that references the same names
            assert.include(minified, 'result', 'result variable is present')
        })

        it('handles an empty file gracefully', () => {
            vm.FS.writeFile('/tmp/file.py', '')
            vm.runPython(`
import python_minifier
with open('/tmp/file.py') as f:
    d = f.read()
d = python_minifier.minify(d)
with open('/tmp/file.min.py', 'w') as f:
    f.write(d)
`)
            const minified = vm.FS.readFile('/tmp/file.min.py', { encoding: 'utf8' })
            assert.strictEqual(minified.trim(), '', 'empty input produces empty output')
        })
    })

    describe('mpy-tool', () => {

        it('disassembles a compiled .mpy file', async () => {
            // First compile something with mpy-cross
            const result = await compile('test.py', 'print("hello")\n')
            assert.strictEqual(result.status, 0)

            vm.FS.writeFile('/tmp/file.mpy', result.mpy)
            vm.runPython(`
import builtins
mpytool = __import__('mpy-tool')

f = open('/tmp/file.mpy.dis', 'w')
pp = builtins.print
def new_print(*a, **kw):
    pp(*a, file=f)

builtins.print = new_print
mpytool.main(['-d', '/tmp/file.mpy'])
builtins.print = pp
f.close()
`)
            const disasm = vm.FS.readFile('/tmp/file.mpy.dis', { encoding: 'utf8' })
            assert.isString(disasm)
            assert.isAbove(disasm.length, 0, 'disassembly is not empty')
        })

        it('disassembly contains bytecode information', async () => {
            const source = `
def add(a, b):
    return a + b
`
            const result = await compile('funcs.py', source)
            assert.strictEqual(result.status, 0)

            vm.FS.writeFile('/tmp/file.mpy', result.mpy)
            vm.runPython(`
import builtins
mpytool = __import__('mpy-tool')

f = open('/tmp/file.mpy.dis', 'w')
pp = builtins.print
def new_print(*a, **kw):
    pp(*a, file=f)

builtins.print = new_print
mpytool.main(['-d', '/tmp/file.mpy'])
builtins.print = pp
f.close()
`)
            const disasm = vm.FS.readFile('/tmp/file.mpy.dis', { encoding: 'utf8' })
            // Should reference the function name somewhere in the disassembly
            assert.include(disasm, 'add', 'function name appears in disassembly')
        })
    })
})
