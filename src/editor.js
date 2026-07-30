/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { basicSetup } from 'codemirror'
import { EditorView, ViewPlugin, keymap, Decoration, MatchDecorator } from '@codemirror/view'
import { EditorState, RangeSetBuilder, Prec, StateEffect } from '@codemirror/state'
import { StreamLanguage, indentUnit, syntaxTree } from '@codemirror/language'
import { indentWithTab } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { json as modeJSON, jsonParseLinter } from '@codemirror/lang-json'
import { markdown as modeMD } from '@codemirror/lang-markdown'
import { simpleMode } from '@codemirror/legacy-modes/mode/simple-mode'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { monokaiInit } from '@uiw/codemirror-theme-monokai'
import { tags } from '@lezer/highlight'
import { linter } from '@codemirror/lint'

import { validatePython, getRuffWorkspace } from './python_utils.js'

/*
 * Highlight links in comments
 */

const urlRegex = /(https?:\/\/[^\s]+)/g;

const linkDecorator = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view) {
    const builder = new RangeSetBuilder();
    for (let {from, to} of view.visibleRanges) {
      let text = view.state.sliceDoc(from, to);
      let match;
      while ((match = urlRegex.exec(text))) {
        let start = from + match.index;
        let end = start + match[0].length;
        if (this.isInComment(view, start)) {
          builder.add(start, end, Decoration.mark({class: "cm-link"}));
        }
      }
    }
    return builder.finish();
  }

  isInComment(view, pos) {
    let tree = syntaxTree(view.state);
    let node = tree.resolveInner(pos);
    while (node) {
      if (node.type.name.toLowerCase().includes("comment")) {
        return true;
      }
      node = node.parent;
    }
    return false;
  }
}, {
  decorations: v => v.decorations
});

const linkClickPlugin = EditorView.domEventHandlers({
  click(event, _view) {
    const target = event.target;
    if (target.classList.contains("cm-link")) {
      const url = target.textContent;
      window.open(url, "_blank");
      event.preventDefault();
    }
  }
});

const linkCommentExtensions = [
  Prec.highest(linkDecorator),
  linkClickPlugin,
  EditorView.theme({
    ".cm-link": {
      "cursor": "pointer",
      "font-weight": 600,
      "text-underline-offset": "0.2rem",
      "text-decoration": "underline dotted 1px",
      "-webkit-text-decoration": "underline dotted 1px",
    }
  })
];


/*
 * Highlight special comments
 * TODO: only highlight in comments
 */

const specialCommentDecorator = new MatchDecorator({
  regexp: /(NOTE|OPTIMIZE|TODO|WARNING|WARN|HACK|XXX|FIXME):?/g,
  decorate: (add, from, to, _match) => add(from, to, Decoration.mark({ class: "special-comment" })),
});

const specialCommentView = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = specialCommentDecorator.createDeco(view);
  }
  update(update) {
    this.decorations = specialCommentDecorator.updateDeco(update, this.decorations);
  }
}, {
  decorations: v => v.decorations
});

const specialCommentExtensions = [
  specialCommentView.extension,
  EditorView.theme({
    ".special-comment": {
      backgroundColor: "brown",
    },
  }),
];

/*
 * Syntax highlight modes
 */

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
    // Global information about the mode
    languageData: {
        name: 'pem',
        commentTokens: { line: '#' },
    }
}))

/*
 * INI / INF configuration files:
 *
 *   ; comment
 *   [section]
 *   key = value    # inline comment
 */

// An unindented line always begins a fresh section or key; re-syncing here
// keeps a dangling `key =` from swallowing the rest of the file as its value.
// An indented line, however, continues the previous value across multiple
// lines - a configparser convention used by tools such as platformio.ini:
//
//   build_flags =
//     -Wall
//     -Wextra
const iniLineStart = {sol: true, regex: /(?=\S)/, token: null, next: 'start'}

const iniComment = {regex: /(?:[;#]|\/\/).*/, token: 'comment'}

const modeINI = StreamLanguage.define(simpleMode({
    start: [
        {regex: /\s+/,                            token: null},
        iniComment,
        {regex: /\[[^\]]*\]/,                     token: 'keyword'},
        // A key, up to the `=` or `:` that follows it. Keys may contain spaces,
        // and only a key that is actually assigned to enters the `property` state
        {regex: /[^\s=:;#][^=:;#]*?(?=\s*[=:])/,  token: 'property', next: 'property'},
        {regex: /\S+/,                            token: 'variable'},
    ],
    property: [
        iniLineStart,
        {regex: /\s*[=:]\s*/,                     token: 'operator', next: 'value'},
    ],
    value: [
        iniLineStart,
        // An inline comment needs leading whitespace, so that `#` and `;` stay
        // usable inside values such as paths and passwords
        {regex: /\s+(?:[;#]|\/\/).*/,                              token: 'comment'},
        {regex: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/,             token: 'string'},
        // Atoms and numbers only count as such when they make up the whole value,
        // which ends at a comma, an inline comment, or the end of the line
        {regex: /(?:true|false|yes|no|on|off)(?=\s*(?:,|[;#]|$))/i, token: 'atom'},
        {regex: /[-+]?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)(?=\s*(?:,|[;#]|$))/,
                                                                   token: 'number'},
        {regex: /[\s,]+/,                                          token: null},
        {regex: /[^\s,]+/,                                         token: 'string'},
    ],
    languageData: {
        name: 'ini',
        commentTokens: { line: ';' },
    },
}))

/*
 * MicroPython .mpy disassembly, as emitted by `mpy-tool.py -d`:
 *
 *   mpy_source_file: /tmp/file.mpy
 *   header: 4d:06:2f:1f
 *   qstr_table[35]:
 *       <one raw qstr per line, may contain anything>
 *   obj_table: []
 *   simple_name: <module>
 *     raw bytecode: 42 a8:02:02:0c:48:0a
 *     prelude: (6, 2, 0, 0, 0, 0)
 *     10:0d       LOAD_CONST_STRING *
 *     d9          BINARY_OP 2 __eq__
 *     children: [load_model]
 */

// Line starts re-sync the tokenizer regardless of the state the previous line left it in
const mpyDisLineStart = [
    // Module level fields
    {sol: true, regex: /qstr_table\[\d+\]:/,                           token: 'keyword', next: 'qstrs'},
    {sol: true, regex: /(?:mpy_source_file|source_file|simple_name):/, token: 'keyword', next: 'name'},
    {sol: true, regex: /header:/,                                      token: 'keyword', next: 'data'},
    {sol: true, regex: /(?:arch_flags|arch|obj_table):/,               token: 'keyword', next: 'value'},
    // Raw code fields
    {sol: true, regex: / +(?:raw bytecode|raw data|line info):/,       token: 'keyword', next: 'data'},
    {sol: true, regex: / +(?:prelude|args|children):/,                 token: 'keyword', next: 'value'},
    // Encoded bytes of an instruction, or a continuation line of a native code dump
    {sol: true, regex: / +[0-9a-f]{2}(?::[0-9a-f]{2})*(?= |$)/,        token: 'comment', next: 'opcode'},
]

const modeMPY_DIS = StreamLanguage.define(simpleMode({
    start: mpyDisLineStart,

    // Raw qstr strings, listed one per line until the next module level field
    qstrs: [
        {sol: true, regex: /obj_table:/,                                   token: 'keyword', next: 'value'},
        {sol: true, regex: /(?:mpy_source_file|source_file|simple_name):/, token: 'keyword', next: 'name'},
        {regex: /.+/, token: 'string'},
    ],

    // A file path or a scope name
    name: [
        ...mpyDisLineStart,
        {regex: / +/, token: null},
        {regex: /.+/,  token: 'className'},
    ],

    // Byte blobs: "42 a8:02:02", "4d:06:2f:1f", "b'\x80\x0c'"
    data: [
        ...mpyDisLineStart,
        {regex: / +/,                            token: null},
        {regex: /[0-9a-f]{2}(?::[0-9a-f]{2})+/,  token: 'comment'},
        {regex: /b?'(?:[^'\\]|\\.)*'/,           token: 'comment'},
        {regex: /\d+/,                           token: 'number'},    // leading byte count
        {regex: /\S+/,                           token: 'comment'},   // "..." and single bytes
    ],

    // Tuples and lists: "(6, 2, 0, 0, 0, 0)", "['builder', 'f']", "[load_model]"
    value: [
        ...mpyDisLineStart,
        {regex: /[\s,[\]()]+/,                                    token: null},
        {regex: /b?'(?:[^'\\]|\\.)*'|b?"(?:[^"\\]|\\.)*"/,        token: 'string'},
        {regex: /-?(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b/,           token: 'number'},
        {regex: /[^\s,[\]()]+/,                                   token: 'className'},
    ],

    opcode: [
        ...mpyDisLineStart,
        {regex: / +/,                          token: null},
        {regex: /LOAD_CONST_STRING\b/,         token: 'propertyName', next: 'text'},
        {regex: /[A-Za-z_][A-Za-z0-9_]*/,      token: 'propertyName', next: 'operand'},
    ],

    // Instruction argument: a jump offset, a child index, or a raw qstr
    operand: [
        ...mpyDisLineStart,
        {regex: / +/,                                       token: null},
        {regex: /-?(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b/,     token: 'number'},
        {regex: /__[A-Za-z0-9_]+__|<[^>]*>/,                token: 'operator'},   // unary/binary op names
        {regex: /b?'(?:[^'\\]|\\.)*'|b?"(?:[^"\\]|\\.)*"/,  token: 'string'},     // LOAD_CONST_OBJ
        {regex: /.+/,                                       token: 'atom'},       // qstr: a name, unquoted
    ],

    // LOAD_CONST_STRING argument: a raw qstr, unquoted and possibly spanning lines
    text: [
        ...mpyDisLineStart,
        {regex: / +/, token: null},
        {regex: /.+/, token: 'string'},
    ],
}))

const modeTOML = StreamLanguage.define(toml)

/*
 * mpy-cross linter
 */

let devInfo

const mpyCrossLinter = linter(async (view) => {
  const content = view.state.doc.toString()
  const backtrace = await validatePython('stdin.py', content, devInfo)

  const diagnostics = []
  if (backtrace) {
    const frame = backtrace.frames[0]
    const line = view.state.doc.line(frame.line)
    diagnostics.push({
      from: line.from,
      to: line.to,
      severity: 'error',
      message: 'MicroPython: ' + backtrace.message,
    })
  }
  return diagnostics
})

/*
 * Ruff linter
 */

function ruffLinter(ruff) {
  return linter((view) => {
    const doc = view.state.doc
    const res = ruff.check(doc.toString())

    const diagnostics = []
    for (let d of res) {
      diagnostics.push({
        from: doc.line(d.start_location.row).from + d.start_location.column - 1,
        to:   doc.line(d.end_location.row).from + d.end_location.column - 1,
        severity: (d.message.indexOf('Error:') >= 0) ? 'error' : 'warning',
        message: d.code ? d.code + ': ' + d.message : d.message,
      })
    }
    return diagnostics
  })
}

/*
 * Theme helpers
 */


function svg(content, attrs = `viewBox="0 0 40 40"`) {
  return `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${encodeURIComponent(content)}</svg>')`
}

function underline(color) {
  return svg(`<path d="m0 2.5 l2 -1.5 l1 0 l2 1.5 l1 0" stroke="${color}" fill="none" stroke-width=".85"/>`,
             `width="6" height="3"`)
}

const extraTheme = EditorView.theme({
  ".cm-content": {
    borderLeft: "1px solid var(--bg-color)",
  },
  ".cm-scroller": {
    lineHeight: "1.5em",
  },
  ".cm-lineNumbers": {
    fontWeight: "300",
  },

  ".cm-lintRange": {
    paddingBottom: "2px",
  },

  ".cm-diagnostic-error":   { borderLeft: "5px solid #f11" },
  ".cm-diagnostic-warning": { borderLeft: "5px solid gold" },
  ".cm-diagnostic-info":    { borderLeft: "5px solid #999" },
  ".cm-diagnostic-hint":    { borderLeft: "5px solid #66d" },

  ".cm-lintRange-error":    { backgroundImage: underline("#f11") },
  ".cm-lintRange-warning":  { backgroundImage: underline("gold") },
  ".cm-lintRange-info":     { backgroundImage: underline("#999") },
  ".cm-lintRange-hint":     { backgroundImage: underline("#66d") },
  ".cm-lintRange-active":   { backgroundColor: "#ffdd9980" },

  ".cm-lintPoint-warning": {
    "&:after": { borderBottomColor: "gold" }
  },

  ".cm-panel.cm-panel-lint": {
    "& ul": {
      "& [aria-selected]": {
        backgroundColor: "#666",
      },
      "&:focus [aria-selected]": {
        backgroundColor: "#666",
        color: "white"
      },
    }
  }
})

/*
 * Finally, the editor initialization
 */

export async function createNewEditor(editorElement, fn, content, options) {
    let mode = []
    let { wordWrap, readOnly } = options
    if (fn.endsWith('.py')) {
        const ruff = await getRuffWorkspace()
        mode = [
            // TODO: detect indent of existing content
            indentUnit.of('    '), python(),
            ruff && ruffLinter(ruff),
            mpyCrossLinter,
        ]
    } else if (fn.endsWith('.mpy.dis')) {
        mode = [ modeMPY_DIS ]
        /* A disassembly is derived, not stored: there is nothing to save it back
           to. Its byte dumps run to hundreds of characters, so wrap regardless of
           the global setting. */
        wordWrap = true
        readOnly = true
    } else if (fn.endsWith('.json')) {
        mode = [
            modeJSON(),
            linter(jsonParseLinter()),
        ]
    } else if (fn.endsWith('.pem')) {
        mode = [ modePEM ]
    } else if (fn.endsWith('.ini') || fn.endsWith('.inf') ) {
        mode = [ modeINI ]
    } else if (fn.endsWith('.toml')) {
        mode = [ modeTOML ]
    } else if (fn.endsWith('.md')) {
        mode = [ modeMD() ]
    }

    if (wordWrap) {
        mode.push(EditorView.lineWrapping)
    }

    if (readOnly) {
        // `readOnly` is what saving checks; `editable` also drops the caret
        mode.push(EditorState.readOnly.of(true))
        mode.push(EditorView.editable.of(false))
    }

    devInfo = options.devInfo

    const view = new EditorView({
        parent: editorElement,
        state: EditorState.create({
            doc: content,
            extensions: [
                basicSetup,
                //closedText: '▶',
                //openText: '▼',
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
                mode,
                linkCommentExtensions,
                specialCommentExtensions,
                extraTheme,
            ],
        })
    })

    return view
}


/**
 *
 * @param {HTMLElement} element The DOM element to query for an attached CodeMirror editor
 * @returns {EditorView | null} The editor, if any
 */
export function getEditorFromElement(element) {
  return EditorView.findFromDOM(element)
}


/**
 *
 * @param {EditorView} editorView The CodeMirror editor instance to attach an update callback to
 * @param {function(ViewUpdate):void} callback The function that will be called when the editor is updated
 */
export function addUpdateHandler(editorView, callback) {
  editorView.dispatch({effects: StateEffect.appendConfig.of(EditorView.updateListener.of(callback))})
}
