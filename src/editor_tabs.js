import { addUpdateHandler } from './editor.js'
import { QSA, QS, QID } from './utils.js'


let currentTab = 0
let connected = false


/**
 *
 * @param {string} fn The file name (full path) to activate a tab for. If the tab already exists,
 * it will be selected
 * @returns {boolean} Returns true if a tab matching the given file name is found, else false
 */
export function displayOpenFile(fn) {
    const openTab = QS(`#editor-tabs [data-fn="${fn}"]`)
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
        `<div class="tab active" data-tab="${currentTab}" data-fn="${fn}"">
            <span class="tab-title">${fn}</span>
            <a class="menu-action" title="Close">
                <i class="fa-solid fa-xmark fa-fw"></i>
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
    editorTabElement.querySelector(".menu-action").addEventListener("click", (event) => {
        event.stopPropagation()
        _closeTab(editorTabElement.dataset.tab)
    })

    const editorTabTitle = editorTabElement.querySelector(".tab-title")
    editorTabTitle.textContent = fn.split("/").pop()
    editorTabElement.dataset.fn = fn
    if (fn == "Untitled") {
        editorTabElement.classList.add("changed")
    }

    const editorElement = QS(`.editor-tab-pane[data-pane="${currentTab}"] .editor`)
    return editorElement
}


/**Event Listeners **/

document.addEventListener("fileRemoved", (event) => {
    const tab = QS(`#editor-tabs [data-fn="${event.detail.path}"]`)
    if (tab) {
        _closeTab(tab.dataset.tab)
    }
})

document.addEventListener("dirRemoved", (event) => {
    QSA(`#editor-tabs [data-fn^="${event.detail.path}/"]`).forEach((tab) => {
        _closeTab(tab.dataset.tab)
    })
})

document.addEventListener("fileRenamed", (event) => {
    const editorTab = QS(`#editor-tabs [data-fn="${event.detail.old}"]`)
    editorTab.dataset.fn = event.detail.new
    editorTab.querySelector(".tab-title").textContent = event.detail.new.split("/").pop()
})

document.addEventListener("fileSaved", (event) => {
    const editorTab = QS(`#editor-tabs [data-fn="${event.detail.fn}"]`)
    editorTab.classList.remove("changed")
})

document.addEventListener("editorLoaded", (event) => {
    const editorTab = QS(`#editor-tabs [data-fn="${event.detail.fn}"]`)
    addUpdateHandler(event.detail.editor, (update) => {
        if (update.docChanged) {
            editorTab.classList.add("changed")
        }
    })
})

document.addEventListener("deviceConnected", (_event) => {
    connected = true
    _addNewFileButton()
})


/** Helper Functions **/

function _closeTab(index) {
    const tabElement = QS(`#editor-tabs .tab[data-tab="${index}"]`)
    const tabSelected = tabElement.classList.contains("active")
    const editorElement = QS(`.editor-tab-pane[data-pane="${index}"]`)
    const fn = tabElement.dataset.fn

    if (tabElement.classList.contains("changed")) {
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
        createTab("Untitled", "")
        _activateTab(currentTab)
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
