import { QID } from './utils.js'


const settingsElement = QID("menu-settings")
let callbacks = new Map()
let settings = _loadSettings()

/**
 *
 * @param {string} setting The name of the setting to query
 * @returns {boolean} Returns the value of the setting if found, else undefined
 */
export function getSetting(setting) {
    return settings[setting]
}


/**
 *
 * @param {string} setting The name of the setting to update
 * @param {string|boolean} newValue The new value to set the setting to (string for dropdowns, boolean for checkboxes)
 */
export function updateSetting(setting, newValue) {
    // set the DOM
    const settingElement = settingsElement.querySelector(`#${setting}`)
    if (settingElement.tagName == "SELECT") {
        settingElement.value = newValue
    } else if (settingElement.type == "checkbox") {
        settingElement.checked = newValue
    } else {
        console.error(`Element is not <select> or <input type="checkbox">: ${settingElement}`)
    }

    // set our local cache
    settings[setting] = newValue

    // inform any subscribers
    _notify(setting, newValue)

    // persist to local storage
    _persistSettings(settings)
}


/**
 *
 * @param {string} setting The name of the setting to set a callback for
 * @param {function(string):void} callback A callback function that will receive the new value of the setting
 */
export function onSettingChange(setting, callback) {
    if (!callbacks.has(setting)) {
        callbacks.set(setting, [])
    }
    callbacks.get(setting).push(callback)
}


settingsElement.addEventListener("change", (event) => {
    settings = _persistSettings()
    _notify(event.target.id, settings[event.target.id])
})


function _loadSettings() {
    // get settings from either localstorage or read from the DOM (and populate local storage)
    let loadedSettings = JSON.parse(localStorage.getItem("settings"))
    if (!loadedSettings) {
        _persistSettings()
        loadedSettings = JSON.parse(localStorage.getItem("settings"))
    }

    function _setLoadedValue(setting, loadedValue, setter) {
        // if we loaded nothing, then do nothing
        if (loadedValue == undefined) {
            return
        }

        // set the loaded value to the DOM
        setter(loadedValue)

        // notify any code that might need to know about what we loaded
        _notify(setting, loadedValue)
    }

    // loop over all DOM settings elements and load them with the value from local storage
    settingsElement.querySelectorAll("input[type='checkbox']").forEach(element => {
        _setLoadedValue(element.id, loadedSettings[element.id], (value) => element.checked = value)
    })
    settingsElement.querySelectorAll("select").forEach(element => {
        _setLoadedValue(element.id, loadedSettings[element.id], (value) => element.value = value)
    })

    return loadedSettings
}


function _persistSettings(newSettings = undefined) {
    if (!newSettings) {
        // nothing passed into us, so lets read from the DOM and persist that
        newSettings = new Object()
        settingsElement.querySelectorAll("input[type='checkbox']").forEach(element => {
            newSettings[element.id] = element.checked
        })
        settingsElement.querySelectorAll("select").forEach(element => {
            newSettings[element.id] = element.value
        })
    }

    localStorage.setItem("settings", JSON.stringify(newSettings))
    return newSettings
}


function _notify(setting, newValue) {
    // If there are any callbacks for this setting update, then let's call them
    if (callbacks.has(setting)) {
        for (let callback of callbacks.get(setting)) {
            callback(newValue)
        }
    }
}
