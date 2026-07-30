/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

/*
 * Centralized view of the target filesystem: what is on the board, what we last
 * read off it, what the editor is holding, and what has been staged for a
 * drag-out. Everything the IDE knows about device files lives here.
 *
 * Freshness. rawmode.js offers no stat, no hash and no CRC, so the size
 * reported by walkFs() is the only signal there is - and size alone is not
 * enough, since a same-length rewrite on the device would look unchanged. So a
 * cached body is trusted only while both hold:
 *
 *   - its generation is still current. The generation is bumped whenever the
 *     device may have changed behind our back: end of a run, a reboot, typing
 *     at the REPL, a disconnect.
 *   - the listing still reports the size it had when we read it.
 *
 * The same counter doubles as the in-flight guard: a read or write captures it
 * on entry and stores nothing if it moved while awaiting, so a write that
 * resolves after the port died cannot repopulate a cache that was just cleared.
 * What remains uncovered is a same-length write by something we cannot observe
 * (another WebREPL peer, a background thread); a refresh is the way out.
 *
 * Write-through. Only a save writes its bytes straight into the cache. Every
 * other writer calls invalidate(), which records the path so the next
 * reconcileListing() reports it as changed - that is what lets a single
 * delta-driven pass bring open editors back in line, and it also catches an
 * overwrite that happens to have the same length. A save deliberately opts out
 * of that: it updates the listing size too, so the following reconcile finds
 * nothing changed and the editor is not told to reload what it just wrote.
 *
 * A view's baseline is the text handed to the editor, which is not always the
 * bytes on the device: JSON is prettified on open and .mpy is disassembled.
 * Keeping the two apart is what makes "dirty" mean "differs from what was
 * opened", so the marker clears again when an edit is undone.
 *
 * Drafts. Unsaved text is mirrored into localStorage, per device, so closing
 * the browser does not lose it. There are no caps, no LRU and no expiry: a
 * draft lives exactly as long as it represents unsaved work about a file, and
 * is dropped when the file is saved, when the user deletes it, when the tab is
 * closed, or when the text matches the baseline again. A device's record is
 * removed once its last draft goes.
 *
 * This module has no imports on purpose. utils.js pulls in toastr and touches
 * document at module scope, which would make the cache unloadable under the
 * test harness, and staying import-free also makes a cycle with app.js
 * impossible (the bundler is configured to fail on the warning). The cost is
 * a local copy of parentDir() and no way to raise a toast - callers ask
 * persistenceEnabled() instead.
 */

const DRAFT_PREFIX = 'viper-drafts.v1.'

const encoder = new TextEncoder()

let generation = 0          /* bumped when cached bodies may no longer match the device */
let deviceKey = null        /* localStorage key of the current draft bucket */
let ambiguousKey = false    /* the board could not be told apart from others like it */
let deviceLabel = ''
let persistDisabled = false
let listingStale = true
let pendingDrafts = []      /* loaded from storage, waiting to be offered for restore */

const listing = new Map()   /* path -> { size, isDir, virtual } as of the last walk */
const content = new Map()   /* path -> { bytes, size, generation } */
const staged  = new Map()   /* path -> { url, name, type } drag-out payloads */
const views   = new Map()   /* path -> { baseline, draft, kind, readOnly, dirty, conflicted } */
const drafts  = new Map()   /* path -> { text, ts } mirror of this device's stored record */
const touched = new Set()   /* paths written under us since the last reconcile */
const justRenamed = new Set() /* new paths from renamed(), exempted from one reconcile */

/*
 * Internals
 */

function parentOf(path) {
    const i = path.lastIndexOf('/')
    return (i > 0) ? path.slice(0, i) : '/'
}

function toBytes(data) {
    if (typeof data === 'string') { return encoder.encode(data) }
    return (data instanceof Uint8Array) ? data : new Uint8Array(data)
}

function revoke(path) {
    const entry = staged.get(path)
    if (!entry) { return }
    try {
        URL.revokeObjectURL(entry.url)
    } catch (_err) {
        // Nothing to release; the URL was never handed out
    }
    staged.delete(path)
}

/* A folder is staged as a zip of everything below it, so touching any file
   inside invalidates the payloads of every folder above it. */
function revokeAncestors(path) {
    let p = path
    while (p !== '/') {
        p = parentOf(p)
        revoke(p)
    }
}

function unstage(path) {
    revoke(path)
    revokeAncestors(path)
}

/* Forgets a body without arming the next reconcile - used when the reconcile
   itself is what discovered the change. */
function dropContent(path) {
    content.delete(path)
    unstage(path)
}

function validContent(path) {
    const entry = content.get(path)
    if (!entry || entry.generation !== generation) { return null }
    const known = listing.get(path)
    // No listing entry at all (a fresh file, or the welcome tab) is not evidence of staleness
    if (known && known.size !== entry.size) { return null }
    return entry
}

/*
 * Device identity and session
 */

/* Boards that report a unique id get a bucket of their own. Without one the
   best we can do is describe the board, which two identical devices would
   share - hence 'ambiguous', which callers use to ask before restoring. */
function deviceKeyFor(devInfo, connection) {
    if (devInfo && devInfo.uid) {
        return { key: DRAFT_PREFIX + 'uid.' + devInfo.uid, ambiguous: false }
    }
    const parts = [
        devInfo && devInfo.machine, devInfo && devInfo.sysname,
        devInfo && devInfo.release, devInfo && devInfo.version,
        devInfo && devInfo.mpy_arch, devInfo && devInfo.mpy_ver, connection,
    ].join('|')
    return { key: DRAFT_PREFIX + 'mach.' + parts.replace(/[^\w.|-]/g, '_').slice(0, 120), ambiguous: true }
}

/* Binds the draft store to a device. Drafts made before this point - the board
   was not identified yet - belong to whatever board turns out to be there. */
export function setDevice(devInfo, connection) {
    const { key, ambiguous } = deviceKeyFor(devInfo, connection)
    ambiguousKey = ambiguous
    deviceLabel = (devInfo && devInfo.machine) || ''
    if (key === deviceKey) { return { key, ambiguous } }

    const unbound = (deviceKey === null)
    const carried = new Map(drafts)
    deviceKey = key

    drafts.clear()
    const stored = readRecord(key)
    for (const path of Object.keys(stored.files)) {
        const file = stored.files[path]
        if (file && typeof file.text === 'string') {
            drafts.set(path, { text: file.text, ts: file.ts || stored.ts || 0 })
        }
    }
    pendingDrafts = [...drafts].map(([path, file]) => ({ path, text: file.text, ts: file.ts }))
    if (unbound) {
        for (const [path, file] of carried) { drafts.set(path, file) }
    }
    persistNow()
    return { key, ambiguous }
}

/* The port is gone. Everything read off the device is void, but open editors
   keep their text and their backups - that is the point of the backups. */
export function dropDeviceState() {
    generation++
    for (const path of [...staged.keys()]) { revoke(path) }
    /* Whatever board comes back has to be checked against what is still open.
       Only files that were on the board it replaces: a tab with no file behind it
       - the welcome tab, a rendered sysinfo - has nothing to be reconciled against. */
    for (const path of views.keys()) {
        if (listing.has(path)) { touched.add(path) }
    }
    listing.clear()
    content.clear()
    listingStale = true
}

/* Something may have written to the filesystem without going through us: a
   script that just ran, a reboot, a paste at the REPL. */
export function deviceMayHaveChanged() {
    generation++
    listingStale = true
    if (staged.size) { for (const path of [...staged.keys()]) { revoke(path) } }
    if (content.size) { content.clear() }
}

export function isListingStale() { return listingStale }
export function currentGeneration() { return generation }
export function isAmbiguousBucket() { return ambiguousKey }
export function persistenceEnabled() { return !persistDisabled }
export function bucketLabel() { return deviceLabel }

/*
 * Listing
 */

/* Takes a walkFs() tree and returns what changed under us since the previous
   walk, limited to paths anyone is holding on to:
     changed  a different size, or a write we were told about
     gone     no longer on the device
   Both sets have their cached bodies dropped before returning. */
export function reconcileListing(fs_tree, isVirtual) {
    const previous = new Map(listing)
    listing.clear()

    const walk = (nodes) => {
        for (const node of nodes) {
            const isDir = ('content' in node)
            listing.set(node.path, {
                size: isDir ? 0 : node.size,
                isDir,
                virtual: isVirtual ? !!isVirtual(node.path) : false,
            })
            if (isDir) { walk(node.content) }
        }
    }
    walk(fs_tree)

    const armed = new Set(touched)
    touched.clear()

    // A rename is not a content change - the paths it just landed on get one
    // free pass, so a same-tick reconcile cannot report the migrated view as
    // changed (or, worse, gone) because of how the walk happened to time out.
    const exempt = new Set(justRenamed)
    justRenamed.clear()

    const changed = [], gone = []
    for (const path of new Set([...previous.keys(), ...armed])) {
        // Nothing is holding this path, so nobody needs to hear about it
        if (!content.has(path) && !views.has(path)) { continue }
        if (exempt.has(path)) { continue }
        const now = listing.get(path)
        if (!now) { gone.push(path); continue }
        const was = previous.get(path)
        if (armed.has(path) || (was && !was.isDir && was.size !== now.size)) { changed.push(path) }
    }

    for (const path of changed) { dropContent(path) }
    for (const path of gone) { dropContent(path) }

    listingStale = false
    return { changed, gone }
}

export function has(path) { return listing.has(path) }
export function get(path) { return listing.get(path) || null }

export function sizeOf(path) {
    const entry = listing.get(path)
    return entry ? entry.size : null
}

export function countUnder(path) {
    const prefix = (path === '/') ? '/' : path + '/'
    let count = 0
    for (const p of listing.keys()) {
        if (p.startsWith(prefix)) { count++ }
    }
    return count
}

/*
 * Content. These take an already-open raw session, following the _raw_ naming
 * convention in app.js: opening and closing the session stays with the caller.
 */

export async function readFile(raw, path) {
    const hit = validContent(path)
    if (hit) { return hit.bytes }

    const gen = generation
    const bytes = await raw.readFile(path)
    if (gen === generation) {
        content.set(path, { bytes, size: bytes.length, generation: gen })
    }
    return bytes
}

/* The one write that goes through the cache rather than around it - see the
   note on write-through at the top of the file. */
export async function writeFile(raw, path, data) {
    const bytes = toBytes(data)
    const gen = generation
    try {
        await raw.writeFile(path, bytes)
    } catch (err) {
        // How far the write got is unknowable, so nothing about it can be trusted
        invalidate(path)
        throw err
    }
    if (gen === generation) { noteWrite(path, bytes) } else { invalidate(path) }
    return bytes
}

/* Records bytes we know are on the device, including the size, so the next
   reconcile does not read this back as a change someone else made. */
export function noteWrite(path, bytes) {
    const body = toBytes(bytes)
    content.set(path, { bytes: body, size: body.length, generation })
    const known = listing.get(path)
    if (known) {
        known.size = body.length
        known.isDir = false
    } else {
        listing.set(path, { size: body.length, isDir: false, virtual: false })
    }
    unstage(path)
}

export function peek(path) {
    const hit = validContent(path)
    return hit ? hit.bytes : null
}

/* "This changed on the device and I did not tell you what it says now." */
export function invalidate(path) {
    dropContent(path)
    touched.add(path)
}

/*
 * Mutations
 */

export function renamed(oldPath, newPath) {
    if (oldPath === newPath) { return }
    const moved = (p) => (p === oldPath) ? newPath
                       : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length)
                       : null

    // The name is baked into the DownloadURL handed to the browser, so a moved
    // payload cannot be reused - and the folders above both ends have changed
    for (const p of [...staged.keys()]) {
        if (moved(p) !== null) { revoke(p) }
    }
    revoke(newPath)
    revokeAncestors(oldPath)
    revokeAncestors(newPath)

    for (const map of [listing, content, views, drafts]) {
        for (const [p, value] of [...map]) {
            const to = moved(p)
            if (to === null) { continue }
            map.delete(p)
            map.set(to, value)
            justRenamed.add(to)
        }
    }
    for (const p of [...touched]) {
        const to = moved(p)
        if (to !== null) { touched.delete(p); touched.add(to) }
    }
    persistNow()
}

export function removed(path) {
    listing.delete(path)
    content.delete(path)
    views.delete(path)
    touched.delete(path)
    unstage(path)
    if (drafts.delete(path)) { persistNow() }
}

export function removedTree(path) {
    const prefix = path + '/'
    const inside = (p) => (p === path) || p.startsWith(prefix)

    for (const map of [listing, content, views]) {
        for (const p of [...map.keys()]) {
            if (inside(p)) { map.delete(p) }
        }
    }
    for (const p of [...staged.keys()]) {
        if (inside(p)) { revoke(p) }
    }
    for (const p of [...touched]) {
        if (inside(p)) { touched.delete(p) }
    }
    let dropped = false
    for (const p of [...drafts.keys()]) {
        if (inside(p)) { drafts.delete(p); dropped = true }
    }
    revokeAncestors(path)
    if (dropped) { persistNow() }
}

/*
 * Drag-out staging
 */

/* `gen` is the generation the payload was built from. A refresh landing while
   the bytes were on the wire makes them worthless, however fresh they look. */
export function stage(path, { url, name, type, gen } = {}) {
    if (gen !== undefined && gen !== generation) {
        try {
            URL.revokeObjectURL(url)
        } catch (_err) {
            // Nothing to release
        }
        return false
    }
    revoke(path)
    staged.set(path, { url, name, type })
    return true
}

export function stagedFor(path) { return staged.get(path) || null }

/*
 * Editor views
 */

/* `baseline` is the text as handed to the editor, not the bytes on the device.
   `kind` is 'text' for an editor, or 'hex'/'markdown' for a rendered pane. */
export function openView(path, { baseline = '', kind = 'text', readOnly = false } = {}) {
    views.set(path, { baseline, draft: baseline, kind, readOnly, dirty: false, conflicted: false })
}

export function closeView(path) {
    views.delete(path)
    // The tab was closed, which already asked about discarding unsaved changes
    if (drafts.delete(path)) { persistNow() }
}

/* Records what the editor is holding and returns whether it still differs from
   what was opened. Backing the draft up is part of the same step. */
export function setDraft(path, text) {
    const view = views.get(path)
    if (!view) { return false }
    view.draft = text
    view.dirty = !view.readOnly && (text !== view.baseline)
    if (view.dirty) {
        drafts.set(path, { text, ts: Date.now() })
        persistNow()
    } else if (drafts.delete(path)) {
        persistNow()
    }
    return view.dirty
}

/* The editor and the device agree again: after a save, or after reloading a
   clean buffer from the device. */
export function rebaseView(path, text) {
    const view = views.get(path)
    if (!view) { return }
    view.baseline = text
    view.draft = text
    view.dirty = false
    view.conflicted = false
    if (drafts.delete(path)) { persistNow() }
}

export function isDirty(path) {
    const view = views.get(path)
    return !!(view && view.dirty)
}

export function kindOf(path) {
    const view = views.get(path)
    return view ? view.kind : null
}

export function setConflict(path, on) {
    const view = views.get(path)
    if (view) { view.conflicted = !!on }
}

export function isConflicted(path) {
    const view = views.get(path)
    return !!(view && view.conflicted)
}

/*
 * Draft persistence
 */

function readRecord(key) {
    try {
        const stored = JSON.parse(localStorage.getItem(key))
        if (stored && typeof stored === 'object' && stored.files && typeof stored.files === 'object') {
            return stored
        }
    } catch (_err) {
        // Unreadable or corrupt; start this device with a clean record
    }
    return { files: {}, ts: 0 }
}

/* Any failure here disables backups for the session rather than propagating:
   this runs off an editor keystroke, so a throw would land in the global
   unhandled-rejection handler and toast on every edit. Nothing is evicted to
   make room - quietly deleting the user's other unsaved work would be a worse
   outcome than telling them backups have stopped. */
function persistNow() {
    if (!deviceKey || persistDisabled) { return }
    try {
        if (!drafts.size) {
            localStorage.removeItem(deviceKey)
            return
        }
        const files = {}
        for (const [path, file] of drafts) {
            files[path] = { text: file.text, ts: file.ts }
        }
        localStorage.setItem(deviceKey, JSON.stringify({
            key: deviceKey,
            label: deviceLabel,
            ambiguous: ambiguousKey,
            ts: Date.now(),
            files,
        }))
    } catch (err) {
        persistDisabled = true
        console.warn('Unsaved-file backup disabled:', (err && err.message) || err)
    }
}

/* The drafts this device had in storage, offered once per connection. */
export function takeRestorableDrafts() {
    const list = pendingDrafts
    pendingDrafts = []
    return list
}
