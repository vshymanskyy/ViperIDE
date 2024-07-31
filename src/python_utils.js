import { compile as compile_v6 } from '@pybricks/mpy-cross-v6'
import { splitPath } from './utils.js'

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
    try {
        const [_, fname] = splitPath(filename)
        const wasmUrlV6 = 'https://viper-ide.org/assets/mpy-cross-v6.wasm'
        // TODO: detect the actual arch when possible
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
