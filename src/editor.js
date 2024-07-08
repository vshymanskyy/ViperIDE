/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { StreamLanguage, indentUnit } from '@codemirror/language'
import { indentWithTab } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { json as modeJSON } from '@codemirror/lang-json'
import { markdown as modeMD } from '@codemirror/lang-markdown'
import { simpleMode } from '@codemirror/legacy-modes/mode/simple-mode'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { monokaiInit } from '@uiw/codemirror-theme-monokai'
import { tags } from '@lezer/highlight'
import { linter } from '@codemirror/lint'

import { validatePython } from './python_utils.js'

const modePEM = StreamLanguage.define(simpleMode({
    start: [
        {regex: /-----BEGIN CERTIFICATE-----/, token: 'keyword', next: 'middle'},
        {regex: /[^-]+/, token: 'comment'}
    ],
    middle: [
        {regex: /[A-Za-z0-9+/=]+/, token: 'variable'},
        {regex: /-----END CERTIFICATE-----/, token: 'keyword', next: 'start'},
        {regex: /[^-]+/, token: 'comment'}
    ],
    end: [
        {regex: /.+/, token: 'comment'}
    ],
    // The meta property contains global information about the mode
    meta: {
        lineComment: '#'
    }
}))

const modeINI = StreamLanguage.define(simpleMode({
    start: [
        {regex: /\/\/.*/,       token: 'comment'},
        {regex: /#.*/,         token: 'comment'},
        {regex: /;.*/,         token: 'comment'},
        {regex: /\[[^\]]+\]/,   token: 'keyword'},
        {regex: /[^\s=,]+/,   token: 'variable', next: 'property'}
    ],
    property: [
        {regex: /\s*=\s*/,   token: 'def', next: 'value'},
        {regex: /.*/,   token: null,  next: 'start'}
    ],
    value: [
        {regex: /true|false/i,          token: 'atom',   next: 'start'},
        {regex: /[-+]?0x[a-fA-F0-9]+$/, token: 'number', next: 'start'},
        {regex: /[-+]?\d+$/,            token: 'number', next: 'start'},
        {regex: /.*/,                   token: 'string', next: 'start'}
    ]
}))

const modeTOML = StreamLanguage.define(toml)

const mpyCrossLinter = linter(async (view) => {
  const content = view.state.doc.toString()
  const backtrace = await validatePython('<stdin>', content)

  const diagnostics = []
  if (backtrace) {
    const frame = backtrace.frames[0]
    const line = view.state.doc.line(frame.line)
    diagnostics.push({
      from: line.from,
      to: line.to,
      severity: 'error',
      message: backtrace.message,
    })
  }
  return diagnostics
})

export async function createNewEditor(editorElement, fn, content, options) {
    let mode = []
    if (fn.endsWith('.py')) {
        mode = [
            // TODO: detect indent of existing content
            indentUnit.of('    '), python(),
            mpyCrossLinter,
        ]
    } else if (fn.endsWith('.json')) {
        mode = [ modeJSON() ]
    } else if (fn.endsWith('.pem')) {
        mode = [ modePEM ]
    } else if (fn.endsWith('.ini') || fn.endsWith('.inf') ) {
        mode = [ modeINI ]
    } else if (fn.endsWith('.toml')) {
        mode = [ modeTOML ]
    } else if (fn.endsWith('.md')) {
        mode = [ modeMD() ]
    }

    if (options.wordWrap) {
        mode.push(EditorView.lineWrapping)
    }

    return new EditorView({
        parent: editorElement,
        state: EditorState.create({
            doc: content,
            extensions: [
                basicSetup,
                monokaiInit({
                    settings: {
                        fontFamily: '"Hack", "Droid Sans Mono", "monospace", monospace',
                        background: 'var(--bg-color-edit)',
                        gutterBackground: 'var(--bg-color-edit)',
                    },
                    styles: [
                        {
                            tag: [tags.name, tags.deleted, tags.character, tags.macroName],
                            color: 'white'
                        }, {
                            tag: [tags.meta, tags.comment],
                            color: '#afac99',
                            fontStyle: 'italic',
                            //fontWeight: '300',
                        }
                    ]
                }),
                keymap.of([indentWithTab]),
                ...mode
            ],
        })
    })
}
