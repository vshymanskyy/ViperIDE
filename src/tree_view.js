/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { escapeHTML, escapeCSS } from './utils.js'

/*
 * Minimal tree renderer, shared by the file manager and the package manager.
 *
 * The owner supplies a plain node model and gets back rows with consistent
 * indentation, collapsing, and (optionally) drag & drop. The collapsed state
 * lives in the view and is keyed by path, so it survives a re-render - which
 * matters because the file tree is rebuilt from scratch on every refresh.
 *
 * A container is rendered as a block that wraps its own row and its children,
 * rather than as a flat list of rows with an indentation variable. That way the
 * blank space around a row - the gaps between rows included - belongs to the
 * folder it is nested in, so a drop there lands where it looks like it should.
 *
 * Node model:
 *   name        displayed text
 *   path        unique key: the file path, or the package name
 *   children    array => the node is a container and can be collapsed
 *   icon        icon classes, e.g. 'fa-solid fa-folder'
 *   iconOpen    icon classes used while the node is expanded
 *   suffix      extra HTML appended after the name (already escaped)
 *   meta        secondary text, right-aligned before the actions
 *   classes     extra classes for the name element
 *   data        extra data-* attributes for the name element
 *   action      action fired when the name is clicked (containers: 'toggle')
 *   actions     trailing action buttons: { action, title, icon, label }
 *   collapsed   true => collapse the container the first time it appears
 *   drag        the row can be dragged
 *   move        false => the node can be dragged, but not moved within the tree
 *   drop        false => the node rejects drops (containers accept by default)
 *   rename      false => clicking the name twice does not offer an inline rename
 *   type        'separator' renders a titled divider instead of a row
 */

export const TREE_DRAG_TYPE = 'application/x-viper-path'

export function parentDir(path) {
    const i = path.lastIndexOf('/')
    return (i > 0) ? path.slice(0, i) : '/'
}

export class TreeView {
    constructor(container, {
        onAction = null,
        onMove = null,
        onDropFiles = null,
        onDragStart = null,
        onDragMissed = null,
        onRename = null,
        rootPath = '/',
    } = {}) {
        this.container = container
        this.onAction = onAction
        this.onMove = onMove
        this.onDropFiles = onDropFiles
        this.onDragStart = onDragStart
        this.onDragMissed = onDragMissed
        this.onRename = onRename
        this.rootPath = rootPath
        this.nodes = []
        this.collapsed = new Set()
        this.byPath = new Map()
        this.dragPath = null
        this.renamingPath = null
        this._lastNameClick = null
        this._bindClicks()
        if (onMove || onDropFiles || onDragStart) {
            this._bindDnd()
        }
    }

    setNodes(nodes) {
        const knownPaths = new Set(this.byPath.keys())
        this.nodes = nodes
        this._applyDefaultCollapsed(nodes, knownPaths)
        this.render()
    }

    getNode(path) {
        return this.byPath.get(path)
    }

    getRow(path) {
        return this.container.querySelector(`.tree-row[data-path="${escapeCSS(path)}"]`)
    }

    isCollapsed(path) {
        return this.collapsed.has(path)
    }

    /* Collapsing takes the whole subtree with it, so re-expanding a folder
       reveals one level at a time instead of a previously exploded tree. */
    collapse(path) {
        this.collapsed.add(path)
        const walk = (node) => {
            for (const child of node.children || []) {
                if (child.children) {
                    this.collapsed.add(child.path)
                    walk(child)
                }
            }
        }
        const node = this.byPath.get(path)
        if (node) { walk(node) }
    }

    /* Expands the node and every ancestor, so the row is actually on screen */
    expand(path) {
        for (;;) {
            this.collapsed.delete(path)
            const parent = parentDir(path)
            if (parent === path) break
            path = parent
        }
    }

    toggle(path) {
        if (this.isCollapsed(path)) {
            this.collapsed.delete(path)
        } else {
            this.collapse(path)
        }
        this.render()
    }

    _applyDefaultCollapsed(nodes, knownPaths) {
        for (const node of nodes) {
            if (!Array.isArray(node.children)) continue
            if (node.collapsed && !knownPaths.has(node.path)) {
                this._collapseNode(node)
            } else {
                this._applyDefaultCollapsed(node.children, knownPaths)
            }
        }
    }

    _collapseNode(node) {
        this.collapsed.add(node.path)
        for (const child of node.children || []) {
            if (Array.isArray(child.children)) {
                this._collapseNode(child)
            }
        }
    }

    render() {
        const out = []
        this.byPath = new Map()
        for (const node of this.nodes) {
            this._renderNode(node, out)
        }
        this.container.innerHTML = out.join('')
    }

    _renderNode(node, out) {
        if (node.type === 'separator') {
            out.push(`<div class="title-lines">${escapeHTML(node.name)}</div>`)
            return
        }
        this.byPath.set(node.path, node)

        if (!Array.isArray(node.children)) {
            out.push(this._renderRow(node, false))
            return
        }

        const collapsed = this.isCollapsed(node.path)
        out.push(`<div class="tree-node" data-path="${escapeHTML(node.path)}">`)
        out.push(this._renderRow(node, !collapsed))
        if (!collapsed) {
            out.push(`<div class="tree-children">`)
            for (const child of node.children) {
                this._renderNode(child, out)
            }
            out.push(`</div>`)
        }
        out.push(`</div>`)
    }

    _renderRow(node, expanded) {
        const path = escapeHTML(node.path)

        const icon = (expanded && node.iconOpen) ? node.iconOpen : node.icon
        const label = (icon ? `<i class="${escapeHTML(icon)} fa-fw"></i> ` : '') +
                      escapeHTML(node.name) + (node.suffix || '')
        const classes = ['name'].concat(node.classes || []).join(' ')
        const data = Object.entries(node.data || {})
            .map(([k, v]) => ` data-${k}="${escapeHTML(v)}"`).join('')
        const action = node.action || (node.children ? 'toggle' : null)
        // Without an arrow to click, the tooltip is what tells you the name toggles
        const title = (action === 'toggle') ? ' title="Expand/collapse"' : ''
        const name = action
            ? `<a href="#" class="${classes}"${title} draggable="false" data-action="${escapeHTML(action)}" data-path="${path}"${data}>${label}</a>`
            : `<span class="${classes}"${data}>${label}</span>`

        const meta = node.meta ? `<span class="menu-action">${escapeHTML(node.meta)}</span>` : ''
        const actions = (node.actions || []).map((a) =>
            `<a href="#" class="menu-action" draggable="false" title="${escapeHTML(a.title || '')}" data-action="${escapeHTML(a.action)}" data-path="${path}">` +
            (a.label ? escapeHTML(a.label) + ' ' : '') +
            `<i class="${escapeHTML(a.icon)} fa-fw"></i></a>`
        ).join('')

        return `<div class="tree-row" data-path="${path}"${node.drag ? ' draggable="true"' : ''}>` +
               `${name}${meta}${actions}</div>`
    }

    // A fast double-click still just fires the action twice (open, or toggle
    // back shut) - the same as a real desktop file manager, renaming is a
    // second, deliberate click after a pause, not a faster one
    static RENAME_CLICK_MIN_MS = 100
    static RENAME_CLICK_MAX_MS = 700

    _bindClicks() {
        this.container.addEventListener('click', (ev) => {
            const target = ev.target.closest('[data-action]')
            if (!target) return
            ev.preventDefault()
            // A native double/triple-click is noise here, not a deliberate second click
            if (ev.detail > 1) return

            const path = target.dataset.path
            const action = target.dataset.action
            const node = this.byPath.get(path)
            const renamable = target.classList.contains('name') &&
                this.onRename && node && node.rename !== false && path !== this.rootPath

            if (renamable) {
                const now = Date.now()
                const prev = this._lastNameClick
                this._lastNameClick = { path, time: now }
                if (prev && prev.path === path &&
                    now - prev.time >= TreeView.RENAME_CLICK_MIN_MS &&
                    now - prev.time <= TreeView.RENAME_CLICK_MAX_MS) {
                    this._lastNameClick = null
                    this._startRename(path)
                    return
                }
            }

            this._runAction(action, path)
        })
    }

    _runAction(action, path) {
        if (action === 'toggle') {
            this.toggle(path)
        } else if (this.onAction) {
            this.onAction(action, this.byPath.get(path))
        }
    }

    /* Swaps the row's name label for a text input, in place. Committed on
       Enter or blur, discarded on Escape - losing focus any other way (a click
       elsewhere, a re-render triggered from outside) counts as a commit, since
       there is no obvious "cancel" gesture for that case. */
    _startRename(path) {
        if (!this.onRename || path === this.rootPath) return
        const node = this.byPath.get(path)
        if (!node || node.rename === false) return
        if (this.renamingPath) { this._commitRename() }

        const row = this.getRow(path)
        const nameEl = row && row.querySelector(':scope > .name')
        if (!nameEl) return

        // A plain span, not a clone of nameEl: the original may be an <a
        // href="#"> (toggle/open), and typing or clicking into an input nested
        // in one would still trigger the link's own default navigation.
        const wrap = document.createElement('span')
        wrap.className = nameEl.className + ' renaming'
        // Font Awesome's auto-replacer swaps the rendered <i> for an <svg> some
        // time after render(), so the icon is whatever ended up first in the
        // DOM - not necessarily an <i> - rather than something to query for by tag
        const icon = node.icon ? nameEl.firstElementChild : null
        if (icon) {
            wrap.appendChild(icon.cloneNode(true))
            wrap.appendChild(document.createTextNode(' '))
        }
        nameEl.replaceWith(wrap)

        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'tree-rename-input' + (node.children ? ' folder-rename-input' : '')
        input.spellcheck = false
        input.autocomplete = 'off'
        input.autocapitalize = 'off'
        input.value = node.name
        wrap.appendChild(input)

        this.renamingPath = path
        this._renameNode = node
        this._renameInput = input
        this._renameDone = false

        input.addEventListener('mousedown', (ev) => ev.stopPropagation())
        input.addEventListener('click', (ev) => ev.stopPropagation())
        input.addEventListener('blur', () => this._commitRename())
        input.addEventListener('keydown', (ev) => {
            ev.stopPropagation()
            if (ev.key === 'Enter') { ev.preventDefault(); this._commitRename() }
            else if (ev.key === 'Escape') { ev.preventDefault(); this._cancelRename() }
        })

        input.focus()
        // Containers are selected in full; a file's extension is left alone so a
        // quick fix of the base name does not require retyping it
        const dot = node.name.lastIndexOf('.')
        const selEnd = (!node.children && dot > 0) ? dot : node.name.length
        input.setSelectionRange(0, selEnd)
    }

    _commitRename() {
        if (!this.renamingPath || this._renameDone) return
        this._renameDone = true
        const node = this._renameNode
        const newName = this._renameInput.value.trim()
        this._endRename()
        if (newName && newName !== node.name) {
            this.onRename(node, newName)
        }
    }

    _cancelRename() {
        if (!this.renamingPath || this._renameDone) return
        this._renameDone = true
        this._endRename()
    }

    _endRename() {
        this.renamingPath = null
        this._renameNode = null
        this._renameInput = null
        this.render()
    }

    _bindDnd() {
        const container = this.container

        // Only fires with a null relatedTarget when the pointer leaves the window
        window.addEventListener('dragleave', (ev) => {
            if (this.dragPath && !ev.relatedTarget) { this.leftWindow = true }
        })

        // The user may drag briefly over browser chrome or another window and
        // then come back. Only the final drag position should count.
        window.addEventListener('dragenter', () => {
            if (this.dragPath) { this.leftWindow = false }
        })

        window.addEventListener('dragover', () => {
            if (this.dragPath) { this.leftWindow = false }
        })

        window.addEventListener('drop', () => {
            if (!this.dragPath) return
            this.leftWindow = false
            this.droppedInside = true
        }, { capture: true })

        container.addEventListener('dragstart', (ev) => {
            const row = ev.target.closest('.tree-row[draggable="true"]')
            if (!row) return
            const node = this.byPath.get(row.dataset.path)
            this.dragPath = row.dataset.path
            this.dragRow = row
            this.leftWindow = false
            this.droppedInside = false
            row.classList.add('dragging')
            ev.dataTransfer.effectAllowed = 'move'
            // A private MIME type only: dropping a path into the editor (or into
            // another app) as text would be noise, not a feature.
            ev.dataTransfer.setData(TREE_DRAG_TYPE, row.dataset.path)
            if (this.onDragStart && node) {
                this.onDragStart(node, ev.dataTransfer)
            }
        })

        container.addEventListener('dragend', (ev) => {
            // The drag went out of the window and nothing came of it: the owner
            // may want to get the item ready for the next attempt.
            const node = this.dragPath ? this.byPath.get(this.dragPath) : null
            const missed = node && this.leftWindow && !this.droppedInside
            this._endDrag()
            if (missed && this.onDragMissed) {
                this.onDragMissed(node, ev)
            }
        })

        container.addEventListener('dragover', (ev) => {
            const target = this._dropTarget(ev)
            if (!target) {
                if (this.dragPath) {
                    ev.preventDefault()
                    ev.dataTransfer.dropEffect = 'none'
                }
                this._showDropHint(null)
                return
            }
            ev.preventDefault()
            ev.dataTransfer.dropEffect = target.kind
            this._showDropHint(target.dir)
        })

        container.addEventListener('dragleave', (ev) => {
            if (!container.contains(ev.relatedTarget)) {
                this._showDropHint(null)
            }
        })

        container.addEventListener('drop', (ev) => {
            const target = this._dropTarget(ev)
            const src = this.dragPath
            this.droppedInside = true
            this._endDrag()
            ev.preventDefault()
            ev.stopPropagation()
            if (!target) return
            if (target.kind === 'move') {
                if (src) { this.onMove(src, target.dir) }
            } else {
                this.onDropFiles(ev.dataTransfer, target.dir)
            }
        })
    }

    /* Returns { dir, kind } for a droppable position, or null if the drag
       cannot be accepted here. */
    _dropTarget(ev) {
        const types = ev.dataTransfer ? Array.from(ev.dataTransfer.types) : []
        const internal = this.dragPath || types.includes(TREE_DRAG_TYPE)
        const external = !internal && types.includes('Files')
        if (internal && !(this.onMove && this.dragPath)) return null
        if (external && !this.onDropFiles) return null
        if (!internal && !external) return null

        const dir = this._dirAt(ev.target)
        if (dir === null) return null

        if (internal) {
            const src = this.dragPath
            // Some nodes can be dragged out but have nowhere to go inside the tree
            if (this.byPath.get(src)?.move === false) return null
            // Moving a folder into itself, or an item next to itself, is a no-op
            if (dir === src || dir.startsWith(src + '/')) return null
            if (parentDir(src) === dir) return null
        }
        return { dir, kind: internal ? 'move' : 'copy' }
    }

    /* The directory that receives a drop landing on the given element. A folder
       row takes it directly; a file row, or any blank space, hands it to the
       folder block it is nested in. */
    _dirAt(el) {
        if (!el.closest) return this.rootPath
        const row = el.closest('.tree-row')
        const rowNode = row ? this.byPath.get(row.dataset.path) : null

        let node = (rowNode && rowNode.children) ? rowNode : null
        if (!node) {
            const block = el.closest('.tree-node')
            node = block ? this.byPath.get(block.dataset.path) : null
        }
        if (!node) return this.rootPath
        return (node.drop === false) ? null : node.path
    }

    _showDropHint(dir) {
        let el = null
        if (dir !== null) {
            el = this.container.querySelector(`.tree-node[data-path="${escapeCSS(dir)}"]`) ||
                 this.getRow(dir) || this.container
        }
        if (this.dropHint === el) return
        if (this.dropHint) { this.dropHint.classList.remove('drop-target') }
        this.dropHint = el
        if (el) { el.classList.add('drop-target') }
    }

    _endDrag() {
        this._showDropHint(null)
        if (this.dragRow) { this.dragRow.classList.remove('dragging') }
        this.dragRow = null
        this.dragPath = null
    }
}
