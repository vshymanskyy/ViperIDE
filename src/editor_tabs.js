import { escapeHTML, escapeCSS } from './utils.js'
import { QSA, QS, QID } from './utils_browser.js'


let currentTab = 0
let connected = false


/**
 *
 * @param {string} fn The file name (full path) to activate a tab for. If the tab already exists,
 * it will be selected
 * @returns {boolean} Returns true if a tab matching the given file name is found, else false
 */
export function displayOpenFile(fn) {
    const openTab = QS(`#editor-tabs [data-fn="${escapeCSS(fn)}"]`)
    if (!openTab) {
        return false
    }

    // if we found it already open, then show it and hide the rest
    _activateTab(openTab.dataset.tab)
    return true
}

/**
 *
 * @param {string} fn The file name (full path) that the tab will represent
 * @returns {HTMLElement} The element that will contain the file editor
 */
export function createTab(fn) {
    const tabContainer = QID("editor-tabs")
    const terminal = QID("terminal-container")

    _deactivateTabs()

    currentTab++
    tabContainer.insertAdjacentHTML(
        'beforeend',
        `<div class="tab active" data-tab="${currentTab}" data-fn="${escapeHTML(fn)}">
            <span class="tab-title">${escapeHTML(fn)}</span>
            <a class="menu-action" title="Close">
                <i class="fa-solid fa-xmark"></i>
            </a>
        </div>
        `
    )
    _addNewFileButton()
    terminal.insertAdjacentHTML(
        'beforebegin',
        `<div class="editor-tab-pane active" data-pane="${currentTab}"><div class="editor"></div></div>`
    )

    const editorTabElement = QS(`#editor-tabs [data-tab="${currentTab}"]`)
    editorTabElement.addEventListener("click", (_event) => {
        _activateTab(editorTabElement.dataset.tab)
    })
    const closeButton = editorTabElement.querySelector(".menu-action")

    function close_tab(event) {
        event.stopPropagation()
        _closeTab(editorTabElement.dataset.tab)
    }
    closeButton.addEventListener("click", close_tab)
    editorTabElement.addEventListener("auxclick", close_tab)

    const editorTabTitle = editorTabElement.querySelector(".tab-title")
    editorTabTitle.textContent = fn.split("/").pop()
    editorTabElement.dataset.fn = fn

    const editorElement = QS(`.editor-tab-pane[data-pane="${currentTab}"] .editor`)
    _activateTab(editorTabElement.dataset.tab)
    return editorElement
}


/**
 *
 * @param {HTMLElement} editorElement An element inside an editor tab pane
 * @returns {string|null} The file name the owning tab currently represents. This
 * tracks moves and renames, unlike the name the editor was created with.
 */
export function getTabFileName(editorElement) {
    const pane = editorElement.closest(".editor-tab-pane")
    if (!pane) { return null }
    const tab = QS(`#editor-tabs .tab[data-tab="${pane.dataset.pane}"]`)
    return tab ? tab.dataset.fn : null
}


/**
 * The inverse of getTabFileName: finds the element an editor was mounted into,
 * so a file that changed on the device can be re-rendered in place.
 *
 * @param {string} fn The file name (full path) the tab represents
 * @returns {HTMLElement|null} The editor container, or null if no tab has that name
 */
export function getTabEditorElement(fn) {
    const tab = QS(`#editor-tabs .tab[data-fn="${escapeCSS(fn)}"]`)
    if (!tab) { return null }
    return QS(`.editor-tab-pane[data-pane="${tab.dataset.tab}"] .editor`)
}


/**Event Listeners **/

document.addEventListener("fileRemoved", (event) => {
    const tab = QS(`#editor-tabs [data-fn="${escapeCSS(event.detail.path)}"]`)
    if (tab) {
        _closeTab(tab.dataset.tab)
    }
})

document.addEventListener("dirRemoved", (event) => {
    QSA(`#editor-tabs [data-fn^="${escapeCSS(event.detail.path + '/')}"]`).forEach((tab) => {
        _closeTab(tab.dataset.tab)
    })
})

/* Renaming a folder renames every open file below it, so tabs are matched by
   path prefix as well as by exact name. */
document.addEventListener("fileRenamed", (event) => {
    const { old: oldFn, new: newFn } = event.detail
    for (const tab of QSA(`#editor-tabs [data-fn]`)) {
        const fn = tab.dataset.fn
        let renamed
        if (fn === oldFn) {
            renamed = newFn
        } else if (fn.startsWith(oldFn + '/')) {
            renamed = newFn + fn.slice(oldFn.length)
        } else {
            continue
        }
        tab.dataset.fn = renamed
        tab.querySelector(".tab-title").textContent = renamed.split("/").pop()
    }
})

document.addEventListener("fileSaved", (event) => {
    /* A saved file need not have a tab of its own: a disassembled .mpy is
       displayed under a name that no tab carries. */
    _tabTitle(event.detail.fn)?.classList.remove("changed")
})

/* Whether a file differs from what was opened is decided by the filesystem
   cache, which compares the two - so the marker also clears on an undo. */
document.addEventListener("fileDirtyChanged", (event) => {
    _tabTitle(event.detail.fn)?.classList.toggle("changed", event.detail.dirty)
})

/* The file changed on the device while unsaved edits were open here. */
document.addEventListener("fileConflict", (event) => {
    _tabTitle(event.detail.fn)?.classList.toggle("conflict", event.detail.conflicted)
})

document.addEventListener("deviceConnected", (_event) => {
    connected = true
    _addNewFileButton()
})

document.addEventListener("deviceDisconnected", (_event) => {
    /* Creating a file needs a board, so the button would only no-op */
    connected = false
    QS("[data-new='new']")?.remove()
})


/** Helper Functions **/

function _tabTitle(fn) {
    return QS(`#editor-tabs [data-fn="${escapeCSS(fn)}"] .tab-title`)
}


function _closeTab(index) {
    const tabElement = QS(`#editor-tabs .tab[data-tab="${index}"]`)
    const titleElement = tabElement.querySelector(".tab-title")
    const tabSelected = tabElement.classList.contains("active")
    const editorElement = QS(`.editor-tab-pane[data-pane="${index}"]`)
    const fn = tabElement.dataset.fn

    if (titleElement.classList.contains("changed")) {
        if (!confirm(`${fn} has unsaved changes. Close without saving?`)) {
            return
        }
    }

    let nextSelectedTab = tabElement.nextElementSibling
    if (!nextSelectedTab || nextSelectedTab.dataset.new) {
        nextSelectedTab = tabElement.previousElementSibling
    }
    tabElement.remove()
    editorElement.remove()

    document.dispatchEvent(new CustomEvent("tabClosed", {detail: {fn: fn, editorElement: editorElement}}))

    if (!tabSelected) {
        return
    }

    if (nextSelectedTab && nextSelectedTab.dataset.tab) {
        _activateTab(nextSelectedTab.dataset.tab)
    } else {
        /* Nothing left to activate. The app answers by opening the welcome tab,
           which it also owns at startup - the tabs know nothing of its content. */
        document.dispatchEvent(new CustomEvent("allTabsClosed"))
    }
}


function _activateTab(index) {
    _deactivateTabs()
    const tabElement = QS(`#editor-tabs .tab[data-tab="${index}"]`)
    const editorElement = QS(`.editor-tab-pane[data-pane="${index}"]`)

    tabElement.classList.add("active")
    editorElement.classList.add("active")
    const fn = tabElement.dataset.fn

    document.dispatchEvent(new CustomEvent("tabActivated", {detail: {fn: fn, editorElement: editorElement}}))
}


function _deactivateTabs() {
    QSA("#editor-tabs .tab").forEach((tab) => {
        tab.classList.remove("active")
    })
    QSA(".editor-tab-pane").forEach((pane) => {
        pane.classList.remove("active")
    })
}


function _addNewFileButton() {
    if (!connected) return;

    const editorTabs = QID("editor-tabs")
    const newFileButton = QS("[data-new='new']")
    if (newFileButton) {
        newFileButton.remove()
    }
    editorTabs.insertAdjacentHTML('beforeend', `<a class="tab" data-new="new" href="#" title="New File" onclick="app.createNewFile('/')">+</a>`)
}
