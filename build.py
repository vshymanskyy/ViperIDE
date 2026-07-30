#!/usr/bin/env python3

import os, sys
import json, glob, gzip, tarfile, subprocess
from os import remove, path, makedirs
from shutil import copyfile as cp, copytree, rmtree

# Base URL the IDE is deployed at. It is substituted into the JS (as the
# VIPER_IDE_BASE_URL constant) and into the HTML at build time.
# Override it for local development, i.e. VIPER_IDE_BASE_URL=http://localhost:10001
BASE_URL = os.environ.get("VIPER_IDE_BASE_URL", "https://viper-ide.org")

def run(cmd):
    subprocess.run(cmd, shell=isinstance(cmd, str), check=True)

def readfile(fn):
    with open(fn, 'r', encoding='utf-8') as f:
        return f.read()

def remove_files(*filenames):
    for fn in filenames:
        try:
            remove(fn)
        except FileNotFoundError:
            pass

def gen_translations(src, dst):
    result = {}
    for fn in glob.glob('*.json', root_dir=src):
        lang = fn.replace('.json', '')
        result[lang] = json.loads(readfile(path.join(src, fn)))
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(result, f, separators=(',',':'), ensure_ascii=False, sort_keys=True)

def gen_manifest(src, dst):
    pkg = json.loads(readfile('package.json'))
    result = json.loads(readfile(src))
    result['version'] = pkg['version']
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(result, f, separators=(',',':'), ensure_ascii=False)

def gen_tar(src, dst):
    def reset_tarinfo(tarinfo):
        # Stray bytecode caches must never reach the device image. Returning
        # None drops the entry, and for a directory also stops the recursion.
        if '__pycache__' in tarinfo.name.split('/') or tarinfo.name.endswith('.pyc'):
            return None
        tarinfo.uid = 0
        tarinfo.gid = 0
        tarinfo.uname = ""
        tarinfo.gname = ""
        tarinfo.mtime = 0
        return tarinfo
    with open(dst, 'wb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode='w') as tar:
                for item in sorted(os.listdir(src)):
                    item_path = os.path.join(src, item)
                    tar.add(item_path, arcname=item, filter=reset_tarinfo)

def vendor_pypi_package(spec, dest):
    # --upgrade is required: without it pip silently skips an existing target
    # directory, so a stale vendored copy would never be replaced.
    run([sys.executable, "-m", "pip", "install", "--target", dest,
         "--no-compile", "--no-deps", "--upgrade", "--quiet", spec])
    # pip also drops console scripts and metadata into the target; neither
    # belongs in the on-device filesystem image.
    rmtree(path.join(dest, "bin"), ignore_errors=True)
    for meta in glob.glob("*.dist-info", root_dir=dest):
        rmtree(path.join(dest, meta), ignore_errors=True)

def combine(dst):
    # Insert CSS and JS into HTML
    combined = readfile(dst).replace(
        '<link rel="stylesheet" href="./app.css">', '<style>\n' + readfile('build/app.css') + '\n</style>'
    ).replace(
        '<link rel="stylesheet" href="./viper_lib.css">', '<style>\n' + readfile('build/viper_lib.css') + '\n</style>'
    ).replace(
        '<script src="./app.js"></script>', '<script>\n' + readfile('build/app.js') + '\n</script>'
    ).replace(
        '<script src="./viper_lib.js"></script>', '<script>\n' + readfile('build/viper_lib.js') + '\n</script>'
    )

    for asset in ("app.css", "viper_lib.css", "app.js", "viper_lib.js"):
        if f'{BASE_URL}/{asset}"' in combined:
            raise Exception(f"{dst}: failed to inline {asset}")

    # Write the combined content
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(combined)

if __name__ == "__main__":
    # Prepare
    rmtree("build", ignore_errors=True)
    makedirs("build/assets")
    cp("./src/webrepl_content.js", "./build/webrepl_content.js")
    copytree("./assets", "./build/assets", dirs_exist_ok=True)
    gen_translations("./src/lang/", "build/translations.json")
    gen_manifest("./src/manifest.json", "build/manifest.json")

    vendor_pypi_package("python-minifier==3.2.0", "src/tools_vfs/lib")
    gen_tar("src/tools_vfs", "build/assets/tools_vfs.tar.gz")
    gen_tar("src/vm_vfs", "build/assets/vm_vfs.tar.gz")

    # Build
    os.environ["VIPER_IDE_BASE_URL"] = BASE_URL
    if not path.isdir("node_modules"):
        run("npm install")
    #run("npm run lint")
    #run("npm run test")
    run("npm run build")

    # Combine everything
    combine("build/index.html")
    combine("build/bridge.html")
    combine("build/benchmark.html")

    # Cleanup
    #remove_files("build/translations.json")
    remove_files("build/app.css", "build/viper_lib.css")
    remove_files("build/app.js", "build/viper_lib.js")

    # Add assets from packages
    cp("node_modules/@micropython/micropython-webassembly-pyscript/micropython.wasm", "./build/assets/micropython.wasm")
    # mpy-cross ships one binary per .mpy ABI; python_utils.js picks the one the
    # connected board can import, so all of them have to be served.
    mpy_cross = "node_modules/@vshymanskyy/mpy-cross-wasm/build"
    for wasm in sorted(glob.glob("mpy-cross-v*.wasm", root_dir=mpy_cross)):
        cp(path.join(mpy_cross, wasm), f"./build/assets/{wasm}")
    cp("node_modules/@astral-sh/ruff-wasm-web/ruff_wasm_bg.wasm", "./build/assets/ruff_wasm_bg.wasm")

    print()
    print("Build complete.")
