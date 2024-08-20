/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { basicSetup } from 'codemirror'
import { EditorView, ViewPlugin, keymap, Decoration, MatchDecorator } from '@codemirror/view'
import { EditorState, RangeSetBuilder, Prec } from '@codemirror/state'
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
  click(event, view) {
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
      textDecoration: "underline dotted 1px",
      "-webkit-text-decoration-line": "underline",
      "-webkit-text-decoration-style": "dotted",
      "-webkit-text-decoration-thickness": "1px",
      cursor: "pointer",
    }
  })
];


/*
 * Highlight special comments
 * TODO: only highlight in comments
 */

const specialCommentDecorator = new MatchDecorator({
  regexp: /(NOTE|OPTIMIZE|TODO|WARNING|WARN|HACK|XXX|FIXME|BUG):?/g,
  decorate: (add, from, to, match) => add(from, to, Decoration.mark({ class: "special-comment" })),
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

const modeMPY_DIS = StreamLanguage.define(simpleMode({
  start: [
    // Keywords
    {regex: /(?:mpy_source_file|source_file|header|qstr_table|obj_table|simple_name|raw bytecode|raw data|prelude|args|line info|children|hex dump|disasm)/, token: "keyword"},

    // Opcode names
    {regex: /\b(?:[A-Z][A-Z_]*[A-Z])\b/, token: "def"},

    // Hex bytes
    {regex: /\b(?:[0-9a-fA-F]{2}(?:\s[0-9a-fA-F]{2})*)\b/, token: "number"},

    // Arguments
    {regex: /\b0x[0-9a-fA-F]+\b|\b\d+\b/, token: "number"},

    // String literals
    {regex: /b?'[^']*'|b?"[^"]*"/, token: "string"},

    // Comments
    {regex: /;.*$/, token: "comment"},

    // Anything else
    //{regex: /\s+/, token: "whitespace"},
  ]
}))

const modeTOML = StreamLanguage.define(toml)

/*
 * mpy-cross linter
 */

let devInfo

const mpyCrossLinter = linter(async (view) => {
  const content = view.state.doc.toString()
  const backtrace = await validatePython('<stdin>', content, devInfo)

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
        from: doc.line(d.location.row).from + d.location.column - 1,
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

    if (options.wordWrap) {
        mode.push(EditorView.lineWrapping)
    }

    if (options.readOnly) {
        mode.push(EditorState.readOnly.of(true))
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
