/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 *
 * Boards that micropython.org does not publish firmware for, laid over the vendored
 * index (boards_index.js stays a plain copy of the upstream file, so it can be refreshed
 * by replacing it). An entry has the fields the page uses from an index entry - id,
 * port, mcu, vendor, product, url - plus `firmware`, which says where its image comes
 * from, since it is not micropython.org/resources/firmware:
 *
 *   url       the image itself
 *   cors      true when that host sends Access-Control-Allow-Origin, so the download
 *             needs no relaying proxy
 *   releases  what the Version list offers, as [{ id, label }]
 */

/*
 * WinnerMicro W600: the w60x port is not part of mainline MicroPython. These are
 * robert-hh's builds of his port (github.com/robert-hh/Shared-Stuff, w600_firmware/),
 * one image per board, differing only in the pin names of machine.Pin.board. The
 * repository keeps a single, current build of each - no versioned file names - so
 * "latest" is the only release there is. raw.githubusercontent.com sends
 * Access-Control-Allow-Origin: * (checked 2026-10-04).
 */
const W600_FIRMWARE = 'https://raw.githubusercontent.com/robert-hh/Shared-Stuff/master/w600_firmware'

function w600(id, build, vendor, product) {
    return {
        id,
        build,
        port: 'w60x',
        mcu: 'w600',
        vendor,
        product,
        url: 'https://github.com/robert-hh/Shared-Stuff/tree/master/w600_firmware',
        firmware: {
            url: `${W600_FIRMWARE}/wm_w600_${build}.fls`,
            cors: true,
            releases: [{ id: 'latest', label: 'Latest build (robert-hh)' }],
        },
    }
}

export default [
    w600('W600_GENERIC',         'GENERIC',         'WinnerMicro', 'W600 (generic)'),
    w600('W600_EVB_V2',          'W600_EVB_V2',     'WinnerMicro', 'W600 EVB V2'),
    w600('W600_THINGSTURN_TB01', 'THINGSTURN_TB01', 'Thingsturn',  'TB01'),
    w600('W600_WAVGAT_AIR602',   'WAVGAT_AIR602',   'Wavgat',      'Air602'),
    w600('W600_WEMOS',           'WEMOS_W600',      'Wemos',       'W600'),
    // Sold under several names and by several vendors.
    w600('W600_WIS600',          'WIS600',          'Various',     'WIS600 (TW01, ESP01W)'),
]
