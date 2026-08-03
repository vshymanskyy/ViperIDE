/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { marked, Renderer as MarkedRenderer } from 'marked'
import { rewriteDocUrl } from './package_mgr.js'

marked.use({
    renderer: {
        link(token) {
            return MarkedRenderer.prototype.link.call(this, token)
                .replace(/^<a /, '<a class="link" target="_blank" rel="noopener noreferrer" ')
        },
        image(token) {
            return MarkedRenderer.prototype.image.call(this, token)
                .replace(/^<img /, '<img loading="lazy" decoding="async" ')
        },
    },
})

/* Elements a document is never allowed to bring with it, dropped whole */
const INERT_HTML_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT',
                                 'EMBED', 'APPLET', 'LINK', 'META', 'BASE', 'FORM', 'INPUT',
                                 'BUTTON', 'TEXTAREA', 'SELECT'])

/*
 * Renders HTML that cannot act on its own: every link keeps its text and names
 * its target on hover, but leads nowhere, and anything scriptable is dropped.
 * Markdown carries raw HTML through untouched, so neutralizing the anchors this
 * side of the parser is what covers `<a href>` written out by hand as well.
 *
 * `url` and `version` say where the document was fetched from, which is what
 * the links and images inside it are written relative to. Images are left
 * loadable - a readme without its badges and screenshots is a poor readme, and
 * they come from the host the document itself came from.
 */
function inertHTML(html, { url=null, version=null } = {}) {
    // A parsed document, not a live one: nothing here loads or runs while it is built
    const doc = new DOMParser().parseFromString(html, 'text/html')

    for (const el of doc.body.querySelectorAll('*')) {
        if (INERT_HTML_DROP.has(el.tagName)) { el.remove(); continue }
        for (const attr of [...el.attributes]) {
            if (attr.name.startsWith('on')) { el.removeAttribute(attr.name) }
        }
        if (!url) { continue }
        const attr = el.tagName === 'IMG' ? 'src' : (el.tagName === 'A' ? 'href' : null)
        if (attr && el.hasAttribute(attr)) {
            el.setAttribute(attr, rewriteDocUrl(el.getAttribute(attr), { base: url, branch: version }))
        }
    }

    /* After the pass above, so what moves across has already been cleaned - and
       so the tooltip names the resolved target. The children are moved rather
       than re-serialized, for the same reason. */
    for (const a of doc.body.querySelectorAll('a')) {
        const span = doc.createElement('span')
        span.className = 'link-dead'
        span.setAttribute('title', a.getAttribute('href') || '')
        while (a.firstChild) { span.appendChild(a.firstChild) }
        a.replaceWith(span)
    }

    return doc.body.innerHTML
}

/*
 * Markdown for a viewer pane. `external` is for a document nobody has vetted: a
 * package readme is written by whoever published the package, and an install
 * link is exactly the kind of thing that gets passed around, so its Markdown
 * must not be able to send the user anywhere. It carries where the document was
 * fetched from (`{ url, version }`), so what it points at can still resolve.
 */
export function renderMarkdown(content, { external=null } = {}) {
    const html = marked(content)
    return `<div class="marked-viewer">` + (external ? inertHTML(html, external) : html) + `</div>`
}
