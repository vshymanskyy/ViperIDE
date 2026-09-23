import { splitPath } from './utils.js'
import { TarReader } from '@gera2ld/tarjs'
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript/micropython.mjs'
import { compile as mpyCross, abiVersions, defaultAbi, wasmFileName } from '@vshymanskyy/mpy-cross-wasm'
import __wbg_init, { PositionEncoding, Workspace as RuffWorkspace } from '@astral-sh/ruff-wasm-web'

export function parseStackTrace(stackTrace)
{
    const lines = stackTrace.split('\n');
    const result = {
        type: '',
        message: '',
        summary: '',
        frames: []
    };

    let inTraceback = false;

    for (let line of lines) {
        line = line.trim();

        if (line.startsWith('Traceback (most recent call last):')) {
            inTraceback = true;
            continue;
        }

        if (inTraceback) {
            const fileMatch = line.match(/^File "(.*)", line (\d+)(, in (.*))?/);
            if (fileMatch) {
                result.frames.push({
                    'file': fileMatch[1],
                    'line': parseInt(fileMatch[2]),
                    'scope': fileMatch[4] || '<module>'
                });
            } else {
                const errorMatch = line.match(/^(.*?): (.*)/);
                if (errorMatch) {
                    result.type = errorMatch[1];
                    result.message = errorMatch[2];
                    break;
                }
            }
        }
    }

    const f = result.frames.at(-1)
    if (f) {
        result.summary = `${result.message} at ${f.file}:${f.line}`
        return result;
    }
}

/*
 * The .mpy ABI a board imports, named the way mpy-cross-wasm names its targets.
 * getDeviceInfo() reports it as the .mpy header does: mpy_ver is the major and mpy_sub
 * the sub-version, so v6 sub 3 is ABI '6.3'. Boards without .mpy support report the
 * major as 'py', and a board may well be newer than any ABI we can emit - both come
 * back as null, so callers decide whether that is fatal.
 */
function boardMpyAbi(devInfo) {
    if (!devInfo || !Number.isInteger(devInfo.mpy_ver)) { return null }
    const abi = devInfo.mpy_sub ? `${devInfo.mpy_ver}.${devInfo.mpy_sub}` : `${devInfo.mpy_ver}`
    return abiVersions.includes(abi) ? abi : null
}

function mpyCrossWasmUrl(abi) {
    return `${VIPER_IDE_BASE_URL}/assets/${wasmFileName(abi)}`
}

export async function validatePython(filename, content, devInfo) {
    try {
        const [_, fname] = splitPath(filename)
        // Syntax checking only needs a compiler that accepts the board's dialect, so an
        // unknown ABI falls back to the newest one rather than failing the lint.
        const abi = boardMpyAbi(devInfo) || defaultAbi
        let options = null
        if (devInfo && devInfo.mpy_arch) {
            options = [ "-march="+devInfo.mpy_arch ]
        }
        const result = await mpyCross(fname, content, { abi, options, wasmPath: mpyCrossWasmUrl(abi) })
        if (result.status !== 0) {
            const stderr = result.err.join('\n')
            const stdout = result.out.join('\n')
            const bt = parseStackTrace(stderr)
            if (bt) {
                return bt
            } else {
                console.error("mpy-cross failed:", stdout, stderr)
            }
        }
    } catch (err) {
        console.error("Cannot run mpy-cross", err)
    }
}

export async function compilePython(filename, content, devInfo) {
    if (content instanceof ArrayBuffer) {
        const codec = new TextDecoder("utf-8")
        content = codec.decode(content)
    }
    const [_, fname] = splitPath(filename)
    let abi = defaultAbi
    let options = null

    if (devInfo) {
        // Unlike validation, the result has to actually run on the board, so an ABI we
        // cannot emit is fatal - the caller falls back to installing the .py source.
        abi = boardMpyAbi(devInfo)
        if (!abi) {
            throw new Error(`Only compiling mpy ${abiVersions.join(', ')} is supported`)
        }
        if (devInfo.mpy_arch) {
            options = [ "-march="+devInfo.mpy_arch ]
        }
    }
    const result = await mpyCross(fname, content, { abi, options, wasmPath: mpyCrossWasmUrl(abi) })
    if (result.status !== 0) {
        const stderr = result.err.join('\n')
        const stdout = result.out.join('\n')
        throw new Error("mpy-cross failed:\n" + stdout + "\n" + stderr)
    }
    return result.mpy
}

export function detectIndentStyle(content) {
    const lines = content.split('\n');

    const indentCounts = {
        '    ': 0,
        '  ': 0,
        ' ': 0,
        '\t': 0,
        'undefined': 0
    };

    lines.forEach(line => {
        const leadingWhitespace = line.match(/^\s*/)[0];

        if (leadingWhitespace.length === 0) {
            // Skip empty lines or lines with no leading whitespace
            return;
        }

        if (/^ {4}$/.test(leadingWhitespace)) {
            indentCounts['    '] += 1;
        } else if (/^ {2}$/.test(leadingWhitespace)) {
            indentCounts['  '] += 1;
        } else if (/^ {1}$/.test(leadingWhitespace)) {
            indentCounts[' '] += 1;
        } else if (/^\t$/.test(leadingWhitespace)) {
            indentCounts['\t'] += 1;
        } else {
            indentCounts['undefined'] += 1;
        }
    });

    const sortedIndentCounts = Object.entries(indentCounts).sort((a, b) => b[1] - a[1]);
    const mostCommonIndent = sortedIndentCounts[0];

    if (mostCommonIndent[1] === 0) {
        return 'undefined';
    }

    return mostCommonIndent[0];
}

let _tools_vm;
let _ruff_wspace;

export async function loadVFS(vm, url) {
    // Fetch the tar.gz file from the URL
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}`);
    }
    const decompressedStream = response.body.pipeThrough(new DecompressionStream('gzip'));
    const decompressedBuffer = await new Response(decompressedStream).arrayBuffer();

    const tar = await TarReader.load(decompressedBuffer)

    // Unpack VFS
    for (const entry of tar.fileInfos) {
        if (entry.type == 53) {
            vm.FS.mkdir("/" + entry.name)
        } else if (entry.type == 48) {
            let data = await tar.getFileBlob(entry.name)
            data = await data.arrayBuffer()
            vm.FS.writeFile("/" + entry.name, new Uint8Array(data))
        }
    }
}

export async function getToolsVM() {
    if (_tools_vm) { return _tools_vm }

    _tools_vm = await loadMicroPython({
        pystack: 64 * 1024,
        heapsize: 32 * 1024 * 1024,
        // Keep this request paired with the loader in the current app bundle,
        // even while an older service worker still controls the first reload.
        url: `${VIPER_IDE_BASE_URL}/assets/micropython.wasm?build=${VIPER_IDE_BUILD}`,
        //stdout: (data) => { console.log(data) },
    })

    await loadVFS(_tools_vm, `${VIPER_IDE_BASE_URL}/assets/tools_vfs.tar.gz`)

    return _tools_vm
}

export async function getRuffWorkspace() {
    if (_ruff_wspace) { return _ruff_wspace }
    try {
        await __wbg_init({
            module_or_path: `${VIPER_IDE_BASE_URL}/assets/ruff_wasm_bg.wasm`,
        })
        console.log('Ruff', RuffWorkspace.version())
        _ruff_wspace = new RuffWorkspace({
            'line-length': 120,
            lint: {
                ignore: [
                    'I001',     // Import block is un-sorted or un-formatted
                    'UP031',    // Use format specifiers instead of percent format
                ],
            },
            builtins: [
                'const',            // should be imported, but often used as a builtin
                'execfile',         // often used as a builtin
                // Viper code
                //'ViperTypeError', // rarely used
                //'int',            // already a builtin
                'uint',
                'ptr',
                'ptr8',
                'ptr16',
                'ptr32',
            ],
        }, PositionEncoding.Utf16)
    } catch (err) {
        console.error(`Failed to init Ruff workspace: ${err}`)
    }
    return _ruff_wspace
}

export async function minifyPython(buffer) {
    const vm = await getToolsVM()
    vm.FS.writeFile("/tmp/file.py", buffer)

    vm.runPython(`
import python_minifier
with open('/tmp/file.py') as f:
    d = f.read()
d = python_minifier.minify(
    d,
    remove_literal_statements=True,
    hoist_literals=False
)
with open('/tmp/file.min.py', 'w') as f:
    f.write(d)
`)

    return vm.FS.readFile("/tmp/file.min.py", { encoding: 'utf8' })
}

export async function prettifyPython(buffer) {
    const ruff = await getRuffWorkspace()
    return ruff.format(buffer)
}

export async function disassembleMPY(buffer) {
    const vm = await getToolsVM()
    vm.FS.writeFile("/tmp/file.mpy", buffer)

    vm.runPython(`
import builtins
mpytool = __import__('mpy-tool')

# Redirect output to a file
f = open('/tmp/file.mpy.dis', 'w')
pp = builtins.print
def new_print(*a, **kw):
    pp(*a, file=f)

# Run disassembler
builtins.print = new_print
mpytool.main(['-d', '/tmp/file.mpy'])

# Cleanup
builtins.print = pp
f.close()
`)

    return vm.FS.readFile("/tmp/file.mpy.dis", { encoding: 'utf8' })
}

// Renders a string as a quoted Python string literal
export function reprStr(s, quote) {
  quote = quote || (s.includes("'") && !s.includes('"') ? '"' : "'");
  if (quote !== "'" && quote !== '"') {
    throw new Error("reprStr: quote must be ' or \"");
  }
  const NONPRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;
  let out = quote;
  for (const ch of String(s)) {
    if (ch === '\\') out += '\\\\';
    else if (ch === quote) out += '\\' + quote;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch !== ' ' && NONPRINTABLE.test(ch)) {
      const cp = ch.codePointAt(0);
      if (cp < 0x100) out += '\\x' + cp.toString(16).padStart(2, '0');
      else if (cp < 0x10000) out += '\\u' + cp.toString(16).padStart(4, '0');
      else out += '\\U' + cp.toString(16).padStart(8, '0');
    } else out += ch;
  }
  return out + quote;
}

// Shortest round-trip digits, re-laid-out with CPython's thresholds
// (scientific notation when exp < -4 or exp >= 16).
export function reprFloat(n) {
  if (Number.isNaN(n)) return 'nan';
  if (n === Infinity) return 'inf';
  if (n === -Infinity) return '-inf';

  const sign = n < 0 || Object.is(n, -0) ? '-' : '';
  const [, d0, rest = '', e] = Math.abs(n)
    .toExponential()
    .match(/^(\d)(?:\.(\d+))?e([+-]\d+)$/);
  const digits = d0 + rest;
  const exp = Number(e);

  if (exp < -4 || exp >= 16) {
    const mant = rest ? `${d0}.${rest}` : d0;
    const esign = exp < 0 ? '-' : '+';
    return sign + mant + 'e' + esign + String(Math.abs(exp)).padStart(2, '0');
  }
  if (exp < 0) return sign + '0.' + '0'.repeat(-exp - 1) + digits;
  const int = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
  const frac = digits.slice(exp + 1) || '0';
  return sign + int + '.' + frac;
}

export function repr(value) {
  const seen = new Set();

  const go = (v) => {
    if (v === null || v === undefined) return 'None';

    switch (typeof v) {
      case 'boolean':
        return v ? 'True' : 'False';
      case 'bigint':
        return v.toString();
      case 'string':
        return reprStr(v);
      case 'number':
        if (!Number.isInteger(v) || Object.is(v, -0)) return reprFloat(v);
        // String() would give "1e+21" for big values; ints never use exponents
        return Math.abs(v) < 1e21 ? String(v) : BigInt(v).toString();
      case 'function':
        return `<function ${v.name || '<lambda>'}>`;
      case 'symbol':
        return v.toString();
    }

    if (seen.has(v)) return Array.isArray(v) ? '[...]' : '{...}';
    seen.add(v);
    try {
      if (Array.isArray(v)) return '[' + v.map(go).join(', ') + ']';
      if (v instanceof Set)
        return v.size === 0 ? 'set()' : '{' + [...v].map(go).join(', ') + '}';
      if (v instanceof Map)
        return '{' + [...v].map(([k, val]) => `${go(k)}: ${go(val)}`).join(', ') + '}';

      const proto = Object.getPrototypeOf(v);
      if (proto === Object.prototype || proto === null)
        return (
          '{' +
          Object.entries(v)
            .map(([k, val]) => `${reprStr(k)}: ${go(val)}`)
            .join(', ') +
          '}'
        );
      return `<${v.constructor?.name ?? 'object'} object>`;
    } finally {
      seen.delete(v);
    }
  };

  return go(value);
}
