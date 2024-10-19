/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

import { fetchJSON, fetchArrayBuffer, splitPath } from './utils.js'
import { compilePython } from './python_utils.js'

const MIP_INDEXES = [{
    name: 'featured',
    url:  'https://vsh.pp.ua/mip-featured',
},{
    name: 'micropython-lib',
    url:  'https://micropython.org/pi/v2',
}]

function splitPkgName(s) {
    const [name, version] = s.split(/@(?=[^@]*$)/)
    return [name, version]
}

function expandVars(s, vars) {
    return s.replace(/\{(\w+)\}/g, (match, key) => (vars[key.trim()] || match))
}

function rewriteUrl(url, { base=null, branch=null } = {}) {
    //const input_url = url;
    if (url.startsWith('http://')) {
        url = 'https://' + url.slice(7)
    }

    if (url.startsWith('https://github.com/')) {
        const githubRegex = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/(blob|tree)\/([^/]+)\/(.*?)(\?raw=true)?$/
        const match = url.match(githubRegex)
        if (match) {
            const [, user, repo, , urlBranch, filePath] = match
            branch = branch || urlBranch;
            url = `github:${user}/${repo}/${filePath}`
        } else {
            // Handle root URL case
            url = 'github:' + url.split('/').slice(3).join('/')
        }
    } else if (url.startsWith('https://gitlab.com/')) {
        const gitlabRegex = /https:\/\/gitlab\.com\/([^/]+)\/([^/]+)\/-\/(blob|tree)\/([^/]+)\/(.*?)(\?ref_type=.*)?$/
        const match = url.match(gitlabRegex)
        if (match) {
            const [, user, repo, , urlBranch, filePath] = match
            branch = branch || urlBranch;
            url = `gitlab:${user}/${repo}/${filePath}`
        } else {
            // Handle root URL case
            url = 'gitlab:' + url.split('/').slice(3).join('/')
        }
    }

    if (url.startsWith('github:')) {
        url = url.slice(7).split('/')
        url = 'https://raw.githubusercontent.com/' + url[0] + '/' + url[1] + '/' + (branch || 'HEAD') + '/' + url.slice(2).join('/');
    } else if (url.startsWith('gitlab:')) {
        url = url.slice(7).split('/')
        url = 'https://cdn.statically.io/gl/' + url[0] + '/' + url[1] + '/' + (branch || 'HEAD') + '/' + url.slice(2).join('/');
    } else if (url.startsWith('https://')) {
        // OK, use it as is
    } else {
        if (!base) {
            throw new Error(`${url} cannot be relative in this context`)
        }
        base = base.replace(/\/[^/]*\.[^/]*$/, '')      // Strip filename, if any
        url = base + '/' + url
    }
    //console.log("Translated", input_url, "=>", url)
    return url
}

export async function getPkgIndexes() {
    for (const i of MIP_INDEXES) {
        if (!i.index) {
            i.index = await fetchJSON(rewriteUrl(`${i.url}/index.json`))
            i.index.packages.sort((a,b) => a.name.localeCompare(b.name))
        }
        for (const pkg of i.index.packages) {
            if (!pkg.version && i.index.v === '3.viper-ide') {
                pkg.version = pkg.versions[0].version
            }
        }
    }
    return MIP_INDEXES
}

export async function findPkg(name) {
    for (const index of await getPkgIndexes()) {
        for (const pkg of index.index.packages) {
            if (pkg.name === name) {
                return [index, pkg]
            }
        }
    }
    return [{}, null]
}

async function loadPkgInfo(url, { base=null, version=null }= {}) {
    if (url.endsWith('.py') || url.endsWith('.mpy')) {
        const pkg_info = {
            version: "latest",
            urls: [
                [url.split('/').pop(), url]
            ]
        }
        return [ pkg_info, null ]
    } else {
        if (!url.endsWith('.json')) {
            url += '/package.json'
        }
        const pkg_json = rewriteUrl(url, { base, branch: version })
        const pkg_info = await fetchJSON(pkg_json);
        return [ pkg_info, pkg_json ]
    }
}

export async function rawInstallPkg(raw, name, { dev=null, version=null, index=null, pkg_info=null, pkg_json=null, prefer_source=false } = {}) {
    // Find the first `lib` folder in sys.path
    const lib_path = dev.sys_path.find(x => x.endsWith('/lib'))
    if (!lib_path) {
        throw new Error(`"lib" folder not found in sys.path`)
    }
    let fs_path = ''
    if (dev.sys_path.indexOf('/flash') >= 0 || dev.sys_path.indexOf('/flash/lib') >= 0) {
        fs_path = '/flash'
    }

    if (!version) {
        [ name, version ] = splitPkgName(name)
    }

    if (!pkg_info) {
        try {
            let index_pkg;
            [index, index_pkg] = await findPkg(name)
            if (index_pkg) {  // Found in index
                if (index.index.v === 2) {
                    const mpy_majour = prefer_source ? 'py' : dev.mpy_ver
                    pkg_json = rewriteUrl(`${index.url}/package/${mpy_majour}/${name}/${version || 'latest'}.json`)
                    pkg_info = await fetchJSON(pkg_json)
                } else if (index.index.v === '3.viper-ide') {
                    for (const pkg_ver of index_pkg.versions) {
                        [ pkg_info, pkg_json ] = await loadPkgInfo(pkg_ver.url, { base: index.url, version })
                        break
                    }
                    if (!pkg_info) {
                        throw new Error('Not found')
                    }
                } else {
                    throw new Error(`Package index version ${index.index.v} is not supported`)
                }
            } else {  // Not in index => URL?
                [ pkg_info, pkg_json ] = await loadPkgInfo(name, { base: index.url, version })
            }
        } catch (_err) {
            throw new Error(`Cannot find ${name}@${version}`)
        }
    }

    if (!pkg_info.name) {
        pkg_info.name = name
    }

    if ('hashes' in pkg_info) {
        for (const [fn, hash, ..._] of pkg_info.hashes) {
            const content = await fetchArrayBuffer(rewriteUrl(`${index.url}/file/${hash.slice(0,2)}/${hash}`))
            const target_file = `${lib_path}/${fn}`

            // Ensure path exists
            const [dirname, _] = splitPath(target_file)
            await raw.makePath(dirname)

            await raw.writeFile(target_file, content, 128, true)
        }
    }

    if ('urls' in pkg_info) {
        const vars = {
            ARCH:   dev.mpy_arch,
            MPY:    dev.mpy_ver + '.' + dev.mpy_sub,
            MPY_MAJ: '' + dev.mpy_ver,
        }
        for (let [fn, url, ..._] of pkg_info.urls) {
            url = rewriteUrl(url, { base: pkg_json, branch: version })
            url = expandVars(url, vars)
            let content = await fetchArrayBuffer(url)

            let target_file
            if (fn.startsWith('fs:')) {
                target_file = fn.slice(3)
                target_file = `${fs_path}/${fn}`
            } else {
                if (fn.startsWith('lib:')) { target_file = fn.slice(4) }
                target_file = `${lib_path}/${fn}`

                if (!prefer_source && target_file.endsWith('.py')) {
                    try {
                        content = await compilePython(target_file, content, dev)
                        target_file = target_file.replace(/\.py$/, '.mpy')
                    } catch (_err) {
                        // Ok, just install the source
                    }
                }
            }

            // Ensure path exists
            const [dirname, _] = splitPath(target_file)
            await raw.makePath(dirname)

            await raw.writeFile(target_file, content, 128, true)
        }
    }

    if ('deps' in pkg_info) {
        for (const dep of pkg_info.deps) {
            let dep_pkg, dep_ver, _;
            if (typeof dep === 'string') {
                [dep_pkg, dep_ver] = splitPkgName(dep)
            } else if (Array.isArray(dep)) {
                [dep_pkg, dep_ver, ..._] = dep
            } else {
                throw new Error(`Only strings and arrays are supported in 'deps'`)
            }
            await rawInstallPkg(raw, dep_pkg, { dev, version: dep_ver })
        }
    }

    return pkg_info
}
