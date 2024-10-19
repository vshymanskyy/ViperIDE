import { compile as compile_v6 } from '@pybricks/mpy-cross-v6'
import { splitPath } from './utils.js'
import { TarReader } from '@gera2ld/tarjs'
import ruffInit, { Workspace as RuffWorkspace } from '@astral-sh/ruff-wasm-web'

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

export async function validatePython(filename, content, devInfo) {
    // TODO: looks like it fetches the (cached) wasm file on every run
    // Ideally we want ti init the wasm file once and then reuse the instance multiple times
    try {
        const [_, fname] = splitPath(filename)
        const wasmUrlV6 = 'https://viper-ide.org/assets/mpy-cross-v6.wasm'
        let options = null
        if (devInfo && devInfo.mpy_arch) {
            options = [ "-march="+devInfo.mpy_arch ]
        }
        const result = await compile_v6(fname, content, options, wasmUrlV6)
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
    const wasmUrlV6 = 'https://viper-ide.org/assets/mpy-cross-v6.wasm'
    let options = null

    if (devInfo) {
        if (devInfo.mpy_ver != 6) {
            throw new Error("Only compiling mpy v6 is supported")
        }
        if (devInfo.mpy_arch) {
            options = [ "-march="+devInfo.mpy_arch ]
        }
    }
    const result = await compile_v6(fname, content, options, wasmUrlV6)
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
        url: 'https://viper-ide.org/assets/micropython.wasm',
        //stdout: (data) => { console.log(data) },
    })

    await loadVFS(_tools_vm, 'https://viper-ide.org/assets/tools_vfs.tar.gz')

    return _tools_vm
}

export async function getRuffWorkspace() {
    if (_ruff_wspace) { return _ruff_wspace }
    try {
        await ruffInit({
            module_or_path: 'https://viper-ide.org/assets/ruff_wasm_bg.wasm',
        })
        console.log('Ruff', RuffWorkspace.version())
        const settings = RuffWorkspace.defaultSettings()
        settings.set('line-length', 120)
        //console.log(settings)
        _ruff_wspace = new RuffWorkspace(settings);
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
    remove_annotations=True,
    remove_pass=True,
    remove_literal_statements=True,
    combine_imports=True,
    hoist_literals=False,
    remove_object_base=False,
    remove_debug=True,
    remove_asserts=False,
    rename_locals=True, preserve_locals=None,
    rename_globals=False, preserve_globals=None,
    convert_posargs_to_args=True,
    preserve_shebang=False,
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
