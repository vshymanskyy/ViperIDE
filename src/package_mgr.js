/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { fetchJSON, splitPath } from './utils.js'

const MIP_INDEXES = [{
    name: 'featured',
    url:  'https://vsh.pp.ua/mip-featured',
},{
    name: 'emlearn-micropython',
    url:  'https://vsh.pp.ua/emlearn',
},{
    name: 'micropython-lib',
    url:  'https://micropython.org/pi/v2',
}]

function rewriteUrl(url, { base=null, branch='HEAD' } = {}) {
    if (url.startsWith('github:')) {
        url = url.slice(7).split('/')
        url = 'https://raw.githubusercontent.com/' + url[0] + '/' + url[1] + '/' + branch + '/' + url.slice(2).join('/')
    } else if (url.startsWith('gitlab:')) {
        url = url.slice(7).split('/')
        url = 'https://cdn.statically.io/gl/' + url[0] + '/' + url[1] + '/' + branch + '/' + url.slice(2).join('/')
    } else if (url.startsWith('http://')) {
        url = 'https://' + url.slice(7)
    } else if (url.startsWith('https://')) {
        // ok, use it
    } else {
        if (!base) { throw new Error(`${url} cannot be relative in this context`) }
        base = base.replace(/\/[^/]*\.[^/]*$/, '')     // Strip filename, if any
        base = rewriteUrl(base, { branch })             // Rewite base url
        url = base + '/' + url
    }
    return url
}

export async function getPkgIndexes() {
    for (const i of MIP_INDEXES) {
        if (!i.index) {
            i.index = await fetchJSON(rewriteUrl(`${i.url}/index.json`))
        }
    }
    return MIP_INDEXES
}

export async function rawInstallPkg(raw, index_name, pkg, { dev=null, version=null, pkg_info=null, pkg_json=null, prefer_source=false } = {}) {
    let index = MIP_INDEXES.find(o => o.name === index_name)
    if (!index) {
        index = {}
    }

    if (!dev) {
        dev = await raw.getDeviceInfo()
    }
    const mpy_ver = prefer_source ? 'py' : dev.mpy_ver
    const mpy_ver_full = dev.mpy_ver + "." + dev.mpy_sub
    // Find the first `lib` folder in sys.path
    const lib_path = dev.sys_path.find(x => x.endsWith('/lib'))
    if (!lib_path) {
        throw new Error(`"lib" folder not found in sys.path`)
    }

    function verify_mpy_ver(mpy) {
        if ((typeof mpy === 'string') && !(mpy === mpy_ver_full || mpy === mpy_ver)) { return false }
        if (Array.isArray(mpy) && !(mpy.includes(mpy_ver_full) || mpy.includes(mpy_ver))) { return false }
        return true
    }

    if (!pkg_info) {
        const index_pkg = index.index.packages.find(o => o.name === pkg);
        if (index.index.v === 2) {
            if (!version) { version = 'latest' }
            pkg_json = rewriteUrl(`${index.url}/package/${mpy_ver}/${pkg}/${version}.json`)
            pkg_info = await fetchJSON(pkg_json)
        } else if (index.index.v === '3.viper-ide') {
            for (const pkg_ver of index_pkg.versions) {
                if (!verify_mpy_ver(pkg_ver.mpy)) continue;
                pkg_json = rewriteUrl(pkg_ver.url, { base: index.url })
                pkg_info = await fetchJSON(pkg_json)
                break
            }
        } else {
            throw new Error(`Package index version ${index.index.v} is not supported`)
        }
    } else if (typeof pkg_info === 'string') {
        if (pkg_info.endsWith('.json')) {
            pkg_json = rewriteUrl(pkg_info, { base: index.url })
            pkg_info = await fetchJSON(pkg_json);
        } else {
            const url = pkg_info
            pkg_info = {
                version: "latest",
                urls: [
                    [url.split('/').pop(), url]
                ]
            }
        }
    }

    if ('hashes' in pkg_info) {
        for (const [fn, hash, ..._] of pkg_info.hashes) {
            const response = await fetch(rewriteUrl(`${index.url}/file/${hash.slice(0,2)}/${hash}`))
            if (!response.ok) { throw new Error(response.status) }
            const content = await response.arrayBuffer()
            const target_file = `${lib_path}/${fn}`

            // Ensure path exists
            const [dirname, _] = splitPath(target_file)
            await raw.makePath(dirname)

            await raw.writeFile(target_file, content, 128, true)
        }
    }

    if ('urls' in pkg_info) {
        for (const [fn, url, ..._] of pkg_info.urls) {
            const response = await fetch(rewriteUrl(url, { base: pkg_json }))
            if (!response.ok) { throw new Error(response.status) }
            const content = await response.arrayBuffer()
            const target_file = `${lib_path}/${fn}`

            // Ensure path exists
            const [dirname, _] = splitPath(target_file)
            await raw.makePath(dirname)

            await raw.writeFile(target_file, content, 128, true)
        }
    }

    if ('native' in pkg_info) {
        if (!verify_mpy_ver(pkg_info.mpy)) {
            throw new Error(`Package version ${pkg_info.mpy} incompatible with ${mpy_ver_full}`)
        }
        const native_pkg_info = pkg_info.native[dev.mpy_arch]
        await rawInstallPkg(raw, index_name, pkg, { dev, version, pkg_json, pkg_info: native_pkg_info })
    }

    if ('deps' in pkg_info) {
        for (const [dep_pkg, dep_ver, ..._] of pkg_info.deps) {
            await rawInstallPkg(raw, index_name, dep_pkg, { dev, version: dep_ver })
        }
    }
}
