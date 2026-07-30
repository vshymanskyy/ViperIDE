/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * Filesystem cache: listing reconciliation, content freshness, editor views and
 * the localStorage draft backup.
 *
 * src/fs_cache.js has no imports, so unlike the rest of src/ it loads under Node
 * as-is - no shimming. It does reach for localStorage and URL.createObjectURL,
 * which are stubbed here. Nothing in this suite touches a board.
 */

import { assert } from 'chai'

const MODULE_URL = new URL('../../src/fs_cache.js', import.meta.url).href

let seq = 0
let blobs = null
let storage = null
let originalStorage
let originalCreate
let originalRevoke

function makeStorage() {
    const map = new Map()
    let failing = false
    return {
        getItem: (key) => map.has(key) ? map.get(key) : null,
        setItem: (key, value) => {
            if (failing) {
                const err = new Error('exceeded the quota')
                err.name = 'QuotaExceededError'
                throw err
            }
            map.set(key, String(value))
        },
        removeItem: (key) => { map.delete(key) },
        keys: () => [...map.keys()],
        fail: (on) => { failing = on },
    }
}

/* A fresh copy of the module per test: its state is module-level by design, and
   a query string is the only way to defeat the ES module cache. */
async function freshCache() {
    storage = makeStorage()
    blobs = { created: 0, revoked: 0, live: new Set() }
    globalThis.localStorage = storage
    URL.createObjectURL = () => {
        const url = `blob:test/${++seq}`
        blobs.created++
        blobs.live.add(url)
        return url
    }
    URL.revokeObjectURL = (url) => {
        blobs.revoked++
        blobs.live.delete(url)
    }
    return await import(`${MODULE_URL}?n=${++seq}`)
}

/* walkFs() node shapes: a file carries a size, a directory carries `content`. */
const file = (p, size) => ({ name: p.split('/').pop(), path: p, size })
const dir = (p, content) => ({ name: p.split('/').pop(), path: p, content })

const DEV = { uid: 'aabbcc', machine: 'Board A', sysname: 'esp32', release: '1.24.0' }
const NO_UID = { uid: '', machine: 'Board B', sysname: 'rp2', release: '1.24.0' }

/* Just enough of MpRawMode for the read/write paths. */
function fakeRaw(files = {}) {
    const enc = new TextEncoder()
    return {
        reads: 0,
        writes: 0,
        files,
        async readFile(p) {
            this.reads++
            if (!(p in this.files)) { throw new Error(`ENOENT: ${p}`) }
            return enc.encode(this.files[p])
        },
        async writeFile(p, data) {
            this.writes++
            this.files[p] = new TextDecoder().decode(data)
        },
    }
}

function stageBlob(fc, p, gen) {
    return fc.stage(p, { url: URL.createObjectURL(), name: p.split('/').pop(), type: 'x', gen })
}

describe('FS cache', () => {

    before(() => {
        originalStorage = globalThis.localStorage
        originalCreate = URL.createObjectURL
        originalRevoke = URL.revokeObjectURL
    })

    after(() => {
        globalThis.localStorage = originalStorage
        URL.createObjectURL = originalCreate
        URL.revokeObjectURL = originalRevoke
    })

    /*
     * Listing
     */

    it('first reconcile reports no deltas', async () => {
        const fc = await freshCache()
        assert(fc.isListingStale(), 'starts stale')
        const delta = fc.reconcileListing([file('/main.py', 10), dir('/lib', [file('/lib/a.py', 5)])])
        assert.strictEqual(delta.changed.length, 0, 'changed')
        assert.strictEqual(delta.gone.length, 0, 'gone')
        assert(!fc.isListingStale(), 'no longer stale')
        assert(fc.has('/main.py'), 'file listed')
        assert(fc.has('/lib'), 'dir listed')
        assert.strictEqual(fc.sizeOf('/main.py'), 10)
        assert.strictEqual(fc.get('/lib').isDir, true)
    })

    it('reconcile reports a size change only for paths someone holds', async () => {
        const fc = await freshCache()
        const raw = fakeRaw({ '/held.py': 'x', '/loose.py': 'y' })
        fc.reconcileListing([file('/held.py', 1), file('/loose.py', 1)])
        await fc.readFile(raw, '/held.py')

        const delta = fc.reconcileListing([file('/held.py', 2), file('/loose.py', 2)])
        assert.strictEqual(delta.changed.join(), '/held.py', 'only the cached path is reported')
        assert.strictEqual(fc.peek('/held.py'), null, 'stale body dropped')
    })

    it('reconcile reports a view path with no cached body', async () => {
        const fc = await freshCache()
        fc.reconcileListing([file('/main.py', 3)])
        fc.openView('/main.py', { baseline: 'abc' })
        const delta = fc.reconcileListing([file('/main.py', 4)])
        assert.strictEqual(delta.changed.join(), '/main.py')
    })

    it('a same-length overwrite is caught through invalidate', async () => {
        const fc = await freshCache()
        const raw = fakeRaw({ '/cfg.json': '{"a":1}' })
        fc.reconcileListing([file('/cfg.json', 7)])
        await fc.readFile(raw, '/cfg.json')
        fc.openView('/cfg.json', { baseline: '{"a":1}' })

        // Same size on both walks: only the explicit invalidate can reveal this
        fc.invalidate('/cfg.json')
        const delta = fc.reconcileListing([file('/cfg.json', 7)])
        assert.strictEqual(delta.changed.join(), '/cfg.json')
        assert.strictEqual(fc.peek('/cfg.json'), null)
    })

    it('touched is consumed by one reconcile', async () => {
        const fc = await freshCache()
        fc.reconcileListing([file('/a.py', 1)])
        fc.openView('/a.py', { baseline: 'x' })
        fc.invalidate('/a.py')
        assert.strictEqual(fc.reconcileListing([file('/a.py', 1)]).changed.length, 1, 'first pass')
        assert.strictEqual(fc.reconcileListing([file('/a.py', 1)]).changed.length, 0, 'second pass')
    })

    it('reconcile reports vanished paths that are held', async () => {
        const fc = await freshCache()
        const raw = fakeRaw({ '/gone.py': 'x', '/stays.py': 'y' })
        fc.reconcileListing([file('/gone.py', 1), file('/stays.py', 1)])
        await fc.readFile(raw, '/gone.py')
        await fc.readFile(raw, '/stays.py')

        const delta = fc.reconcileListing([file('/stays.py', 1)])
        assert.strictEqual(delta.gone.join(), '/gone.py')
        assert.strictEqual(fc.has('/gone.py'), false)
        assert.strictEqual(fc.peek('/gone.py'), null)
        assert(fc.peek('/stays.py') !== null, 'the surviving body is kept')
    })

    it('virtual paths are flagged by the caller predicate', async () => {
        const fc = await freshCache()
        const isVirtual = (p) => /^\/(proc|dev|sys)(\/|$)/.test(p)
        fc.reconcileListing([file('/main.py', 1), dir('/proc', [file('/proc/stat', 0)])], isVirtual)
        assert.strictEqual(fc.get('/main.py').virtual, false)
        assert.strictEqual(fc.get('/proc').virtual, true)
        assert.strictEqual(fc.get('/proc/stat').virtual, true)
    })

    it('countUnder counts everything below a path', async () => {
        const fc = await freshCache()
        fc.reconcileListing([
            dir('/lib', [file('/lib/a.py', 1), dir('/lib/sub', [file('/lib/sub/b.py', 1)])]),
            file('/main.py', 1),
        ])
        assert.strictEqual(fc.countUnder('/lib'), 3, '/lib holds a.py, sub, sub/b.py')
        assert.strictEqual(fc.countUnder('/lib/sub'), 1)
        assert.strictEqual(fc.countUnder('/main.py'), 0)
        assert.strictEqual(fc.countUnder('/'), 5, 'lib, lib/a.py, lib/sub, lib/sub/b.py, main.py')
    })

    /*
     * Content and generation
     */

    it('readFile caches and serves without a second read', async () => {
        const fc = await freshCache()
        const raw = fakeRaw({ '/main.py': 'print(1)' })
        fc.reconcileListing([file('/main.py', 8)])

        assert.bytesEqual(await fc.readFile(raw, '/main.py'), new TextEncoder().encode('print(1)'))
        await fc.readFile(raw, '/main.py')
        assert.strictEqual(raw.reads, 1, 'served from cache')
    })

    it('a body whose listed size moved is not served', async () => {
        const fc = await freshCache()
        const raw = fakeRaw({ '/main.py': 'print(1)' })
        fc.reconcileListing([file('/main.py', 8)])
        await fc.readFile(raw, '/main.py')

        // Straight into the listing, as a walk would, without going through reconcile
        fc.reconcileListing([file('/main.py', 99)])
        assert.strictEqual(fc.peek('/main.py'), null)
    })

    it('deviceMayHaveChanged drops bodies but keeps the listing', async () => {
        const fc = await freshCache()
        const raw = fakeRaw({ '/main.py': 'x' })
        fc.reconcileListing([file('/main.py', 1)])
        await fc.readFile(raw, '/main.py')
        stageBlob(fc, '/main.py')

        fc.deviceMayHaveChanged()
        assert(fc.has('/main.py'), 'listing survives so the tree still renders')
        assert.strictEqual(fc.peek('/main.py'), null, 'body dropped')
        assert.strictEqual(fc.stagedFor('/main.py'), null, 'payload dropped')
        assert.strictEqual(blobs.revoked, 1, 'blob released')
        assert(fc.isListingStale(), 'listing marked stale')

        await fc.readFile(raw, '/main.py')
        assert.strictEqual(raw.reads, 2, 're-read after the bump')
    })

    it('dropDeviceState clears the device but keeps views and drafts', async () => {
        const fc = await freshCache()
        const raw = fakeRaw({ '/main.py': 'x' })
        fc.setDevice(DEV, 'usb')
        fc.reconcileListing([file('/main.py', 1)])
        await fc.readFile(raw, '/main.py')
        fc.openView('/main.py', { baseline: 'x' })
        fc.setDraft('/main.py', 'edited')

        fc.dropDeviceState()
        assert.strictEqual(fc.has('/main.py'), false, 'listing cleared')
        assert.strictEqual(fc.peek('/main.py'), null, 'body cleared')
        assert.strictEqual(fc.isDirty('/main.py'), true, 'the open tab keeps its edits')
        assert.strictEqual(fc.kindOf('/main.py'), 'text', 'the view survives')
        assert(storage.keys().length === 1, 'the backup survives')
    })

    it('open views are re-checked against whatever board comes back', async () => {
        const fc = await freshCache()
        fc.reconcileListing([file('/main.py', 1)])
        fc.openView('/main.py', { baseline: 'x' })
        fc.dropDeviceState()

        // Same size as before the drop: without the seeded paths this would look unchanged
        const delta = fc.reconcileListing([file('/main.py', 1)])
        assert.strictEqual(delta.changed.join(), '/main.py')
    })

    it('a tab with no file behind it is not reconciled against the next board', async () => {
        const fc = await freshCache()
        fc.reconcileListing([file('/main.py', 1)])
        fc.openView('~sysinfo.md', { baseline: '' })
        fc.openView('/main.py', { baseline: 'x' })
        fc.dropDeviceState()

        const delta = fc.reconcileListing([file('/main.py', 1)])
        assert.strictEqual(delta.changed.join(), '/main.py')
        assert.strictEqual(delta.gone.length, 0, 'the sysinfo view was never on the board to be missing from it')
    })

    it('a write that resolves after the port died is not cached', async () => {
        const fc = await freshCache()
        fc.reconcileListing([file('/main.py', 1)])
        const raw = fakeRaw({ '/main.py': 'x' })
        const slow = {
            writeFile: async (p, data) => {
                fc.dropDeviceState()          // the port drops mid-write
                return raw.writeFile(p, data)
            },
        }
        await fc.writeFile(slow, '/main.py', 'new content')
        assert.strictEqual(fc.peek('/main.py'), null, 'nothing repopulated')
    })

    it('a read that resolves after a generation bump is not cached', async () => {
        const fc = await freshCache()
        fc.reconcileListing([file('/main.py', 1)])
        const slow = {
            readFile: async () => {
                fc.deviceMayHaveChanged()     // a script ran while the bytes were on the wire
                return new TextEncoder().encode('x')
            },
        }
        await fc.readFile(slow, '/main.py')
        assert.strictEqual(fc.peek('/main.py'), null)
    })

    it('writeFile records the new size so the next reconcile stays quiet', async () => {
        const fc = await freshCache()
        const raw = fakeRaw({ '/main.py': 'x' })
        fc.reconcileListing([file('/main.py', 1)])
        fc.openView('/main.py', { baseline: 'x' })

        await fc.writeFile(raw, '/main.py', 'much longer content')
        assert.strictEqual(fc.sizeOf('/main.py'), 19, 'listing updated by the write')

        const delta = fc.reconcileListing([file('/main.py', 19)])
        assert.strictEqual(delta.changed.length, 0, 'a save does not report itself as a change')
        assert(fc.peek('/main.py') !== null, 'and keeps its body for a drag-out')
    })

    it('a failed write leaves no cache entry and re-arms the reconcile', async () => {
        const fc = await freshCache()
        const raw = fakeRaw({ '/main.py': 'old' })
        fc.reconcileListing([file('/main.py', 3)])
        await fc.readFile(raw, '/main.py')
        fc.openView('/main.py', { baseline: 'old' })

        const broken = { writeFile: async () => { throw new Error('device disconnected') } }
        await assert.rejects(() => fc.writeFile(broken, '/main.py', 'new'), /disconnected/)
        assert.strictEqual(fc.peek('/main.py'), null, 'the old body is no longer trustworthy')
        assert.strictEqual(fc.reconcileListing([file('/main.py', 3)]).changed.join(), '/main.py')
    })

    /*
     * Drag-out staging
     */

    it('staging a stale generation is refused and released', async () => {
        const fc = await freshCache()
        const stale = fc.currentGeneration()
        fc.deviceMayHaveChanged()
        assert.strictEqual(stageBlob(fc, '/main.py', stale), false, 'refused')
        assert.strictEqual(fc.stagedFor('/main.py'), null)
        assert.strictEqual(blobs.live.size, 0, 'the rejected URL was released')
    })

    it('touching a file releases the payloads of the folders above it', async () => {
        const fc = await freshCache()
        fc.reconcileListing([dir('/lib', [dir('/lib/sub', [file('/lib/sub/a.py', 1)])])])
        stageBlob(fc, '/lib/sub/a.py')
        stageBlob(fc, '/lib/sub')
        stageBlob(fc, '/lib')
        stageBlob(fc, '/')
        assert.strictEqual(blobs.live.size, 4)

        fc.invalidate('/lib/sub/a.py')
        assert.strictEqual(blobs.live.size, 0, 'the file and every zip containing it')
    })

    it('staging one file leaves its siblings and parents alone', async () => {
        const fc = await freshCache()
        fc.reconcileListing([dir('/lib', [file('/lib/a.py', 1), file('/lib/b.py', 1)])])
        stageBlob(fc, '/lib')
        stageBlob(fc, '/lib/a.py')
        assert(fc.stagedFor('/lib') !== null, 'the folder payload is still valid')
        assert.strictEqual(blobs.revoked, 0)
    })

    /*
     * Mutations
     */

    it('renamed migrates a whole subtree', async () => {
        const fc = await freshCache()
        const raw = fakeRaw({ '/lib/a.py': 'x' })
        fc.reconcileListing([dir('/lib', [file('/lib/a.py', 1)])])
        await fc.readFile(raw, '/lib/a.py')
        fc.openView('/lib/a.py', { baseline: 'x' })
        fc.setDevice(DEV, 'usb')
        fc.setDraft('/lib/a.py', 'edited')

        fc.renamed('/lib', '/pkg')
        assert.strictEqual(fc.has('/lib/a.py'), false)
        assert(fc.has('/pkg/a.py'), 'listing moved')
        assert(fc.peek('/pkg/a.py') !== null, 'body moved')
        assert.strictEqual(fc.isDirty('/pkg/a.py'), true, 'view and draft moved')
        assert.strictEqual(fc.isDirty('/lib/a.py'), false, 'nothing left behind')

        const stored = JSON.parse(storage.getItem(storage.keys()[0]))
        assert('/pkg/a.py' in stored.files, 'the backup followed the rename')
    })

    it('renamed releases payloads in the moved subtree', async () => {
        const fc = await freshCache()
        fc.reconcileListing([dir('/lib', [file('/lib/a.py', 1)])])
        stageBlob(fc, '/lib/a.py')
        fc.renamed('/lib', '/pkg')
        assert.strictEqual(fc.stagedFor('/pkg/a.py'), null, 'the name is baked into the payload')
        assert.strictEqual(blobs.live.size, 0)
    })

    it('removed forgets the file, its view and its backup', async () => {
        const fc = await freshCache()
        fc.setDevice(DEV, 'usb')
        fc.reconcileListing([file('/main.py', 1)])
        fc.openView('/main.py', { baseline: 'x' })
        fc.setDraft('/main.py', 'edited')
        stageBlob(fc, '/main.py')

        fc.removed('/main.py')
        assert.strictEqual(fc.has('/main.py'), false)
        assert.strictEqual(fc.kindOf('/main.py'), null)
        assert.strictEqual(fc.stagedFor('/main.py'), null)
        assert.strictEqual(storage.keys().length, 0, 'an explicit delete drops the backup')
    })

    it('removedTree forgets everything below the path', async () => {
        const fc = await freshCache()
        fc.setDevice(DEV, 'usb')
        fc.reconcileListing([dir('/lib', [file('/lib/a.py', 1)]), file('/keep.py', 1)])
        fc.openView('/lib/a.py', { baseline: 'x' })
        fc.setDraft('/lib/a.py', 'edited')
        fc.openView('/keep.py', { baseline: 'y' })
        fc.setDraft('/keep.py', 'also edited')

        fc.removedTree('/lib')
        assert.strictEqual(fc.has('/lib'), false)
        assert.strictEqual(fc.has('/lib/a.py'), false)
        assert.strictEqual(fc.kindOf('/lib/a.py'), null)
        assert.strictEqual(fc.isDirty('/keep.py'), true, 'a sibling is untouched')

        const stored = JSON.parse(storage.getItem(storage.keys()[0]))
        assert.strictEqual(Object.keys(stored.files).join(), '/keep.py')
    })

    /*
     * Editor views
     */

    it('dirty is a comparison, so an undo clears it', async () => {
        const fc = await freshCache()
        fc.openView('/main.py', { baseline: 'print(1)' })
        assert.strictEqual(fc.isDirty('/main.py'), false, 'freshly opened')
        assert.strictEqual(fc.setDraft('/main.py', 'print(2)'), true, 'edited')
        assert.strictEqual(fc.setDraft('/main.py', 'print(1)'), false, 'undone back to the original')
        assert.strictEqual(fc.isDirty('/main.py'), false)
    })

    it('a read-only view is never dirty', async () => {
        const fc = await freshCache()
        fc.setDevice(DEV, 'usb')
        fc.openView('/fw.mpy', { baseline: 'disassembly', readOnly: true })
        assert.strictEqual(fc.setDraft('/fw.mpy', 'anything else'), false)
        assert.strictEqual(storage.keys().length, 0, 'and is never backed up')
    })

    it('a rendered pane keeps its kind', async () => {
        const fc = await freshCache()
        fc.openView('/img.bin', { baseline: '', kind: 'hex', readOnly: true })
        fc.openView('/README.md', { baseline: '# hi', kind: 'markdown', readOnly: true })
        assert.strictEqual(fc.kindOf('/img.bin'), 'hex')
        assert.strictEqual(fc.kindOf('/README.md'), 'markdown')
        assert.strictEqual(fc.kindOf('/nope.py'), null, 'not open')
    })

    it('rebaseView clears dirty and conflict together', async () => {
        const fc = await freshCache()
        fc.openView('/main.py', { baseline: 'a' })
        fc.setDraft('/main.py', 'b')
        fc.setConflict('/main.py', true)
        assert.strictEqual(fc.isConflicted('/main.py'), true)

        fc.rebaseView('/main.py', 'b')
        assert.strictEqual(fc.isDirty('/main.py'), false)
        assert.strictEqual(fc.isConflicted('/main.py'), false)
        assert.strictEqual(fc.setDraft('/main.py', 'b'), false, 'b is the new baseline')
    })

    /*
     * Draft backup
     */

    it('a draft is backed up and dropped again on save', async () => {
        const fc = await freshCache()
        fc.setDevice(DEV, 'usb')
        fc.openView('/main.py', { baseline: 'a' })

        fc.setDraft('/main.py', 'b')
        assert.strictEqual(storage.keys().length, 1, 'backed up')
        const stored = JSON.parse(storage.getItem(storage.keys()[0]))
        assert.strictEqual(stored.files['/main.py'].text, 'b')
        assert.strictEqual(stored.ambiguous, false)

        fc.rebaseView('/main.py', 'b')
        assert.strictEqual(storage.keys().length, 0, 'the record goes when its last draft does')
    })

    it('closing a tab drops its backup', async () => {
        const fc = await freshCache()
        fc.setDevice(DEV, 'usb')
        fc.openView('/main.py', { baseline: 'a' })
        fc.setDraft('/main.py', 'b')
        fc.closeView('/main.py')
        assert.strictEqual(storage.keys().length, 0)
        assert.strictEqual(fc.kindOf('/main.py'), null)
    })

    it('undoing back to the baseline drops the backup', async () => {
        const fc = await freshCache()
        fc.setDevice(DEV, 'usb')
        fc.openView('/main.py', { baseline: 'a' })
        fc.setDraft('/main.py', 'b')
        assert.strictEqual(storage.keys().length, 1)
        fc.setDraft('/main.py', 'a')
        assert.strictEqual(storage.keys().length, 0)
    })

    it('a draft survives a disconnect and is offered on the next connect', async () => {
        const fc = await freshCache()
        fc.setDevice(DEV, 'usb')
        fc.openView('/main.py', { baseline: 'a' })
        fc.setDraft('/main.py', 'work in progress')
        fc.dropDeviceState()

        // A new session, same board
        const next = await import(`${MODULE_URL}?n=${++seq}`)
        assert.strictEqual(next.takeRestorableDrafts().length, 0, 'nothing before the board is known')
        next.setDevice(DEV, 'usb')
        const restorable = next.takeRestorableDrafts()
        assert.strictEqual(restorable.length, 1)
        assert.strictEqual(restorable[0].path, '/main.py')
        assert.strictEqual(restorable[0].text, 'work in progress')
        assert.strictEqual(next.takeRestorableDrafts().length, 0, 'offered once')
    })

    it('another board sees none of it', async () => {
        const fc = await freshCache()
        fc.setDevice(DEV, 'usb')
        fc.openView('/main.py', { baseline: 'a' })
        fc.setDraft('/main.py', 'b')

        const next = await import(`${MODULE_URL}?n=${++seq}`)
        next.setDevice({ uid: 'ffffff', machine: 'Other' }, 'usb')
        assert.strictEqual(next.takeRestorableDrafts().length, 0)
        assert.strictEqual(storage.keys().length, 1, "and the first board's record is left alone")
    })

    it('a board with no uid gets an ambiguous bucket', async () => {
        const fc = await freshCache()
        const { ambiguous } = fc.setDevice(NO_UID, 'usb')
        assert.strictEqual(ambiguous, true)
        assert.strictEqual(fc.isAmbiguousBucket(), true)
        fc.openView('/main.py', { baseline: 'a' })
        fc.setDraft('/main.py', 'b')

        const next = await import(`${MODULE_URL}?n=${++seq}`)
        next.setDevice(NO_UID, 'usb')
        assert.strictEqual(next.isAmbiguousBucket(), true, 'so the caller can ask before restoring')
        assert.strictEqual(next.takeRestorableDrafts().length, 1, 'but the work is still there')
    })

    it('drafts made before the board is known are kept', async () => {
        const fc = await freshCache()
        fc.openView('/notes.txt', { baseline: '' })
        fc.setDraft('/notes.txt', 'notes to self')
        assert.strictEqual(storage.keys().length, 0, 'nowhere to put it yet')

        fc.setDevice(DEV, 'usb')
        assert.strictEqual(storage.keys().length, 1, 'flushed once the board is identified')
        const stored = JSON.parse(storage.getItem(storage.keys()[0]))
        assert.strictEqual(stored.files['/notes.txt'].text, 'notes to self')
    })

    it('a full store disables backups without losing anything else', async () => {
        const fc = await freshCache()
        fc.setDevice(DEV, 'usb')
        fc.openView('/a.py', { baseline: '' })
        fc.setDraft('/a.py', 'first')
        assert.strictEqual(fc.persistenceEnabled(), true)

        storage.fail(true)
        fc.openView('/b.py', { baseline: '' })
        fc.setDraft('/b.py', 'second')          // must not throw
        assert.strictEqual(fc.persistenceEnabled(), false, 'reported, not thrown')

        const stored = JSON.parse(storage.getItem(storage.keys()[0]))
        assert.strictEqual(Object.keys(stored.files).join(), '/a.py', 'the earlier draft is untouched')
        assert.strictEqual(fc.isDirty('/b.py'), true, 'and the editor still tracks the new one')
    })

    it('a corrupt record is ignored rather than fatal', async () => {
        await freshCache()
        storage.setItem('viper-drafts.v1.uid.aabbcc', '{not json')
        const fc = await import(`${MODULE_URL}?n=${++seq}`)
        fc.setDevice(DEV, 'usb')
        assert.strictEqual(fc.takeRestorableDrafts().length, 0)
        assert.strictEqual(fc.persistenceEnabled(), true)
    })
})
