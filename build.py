#!/usr/bin/env python3

import os, time
import json, glob, tarfile, requests
from io import BytesIO
from zipfile import ZipFile
from os import remove as rm, system, path, makedirs
from shutil import copyfile as cp, copytree, rmtree

def run(cmd):
    if system(cmd) != 0:
        raise Exception(f"Command failed: {cmd}")

def readfile(fn):
    with open(fn, 'r', encoding='utf-8') as f:
        return f.read()

def gen_translations(src, dst):
    result = {}
    for fn in glob.glob('*.json', root_dir=src):
        lang = fn.replace('.json', '')
        result[lang] = json.loads(readfile(src + fn))
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
        tarinfo.uid = 0
        tarinfo.gid = 0
        tarinfo.uname = ""
        tarinfo.gname = ""
        tarinfo.mtime = 0
        return tarinfo
    with tarfile.open(dst, "w:gz") as tar:
        for item in os.listdir(src):
            item_path = os.path.join(src, item)
            tar.add(item_path, arcname=item, filter=reset_tarinfo)

def download_and_extract(url, subfolder, dest):
    response = requests.get(url)
    response.raise_for_status()
    with ZipFile(BytesIO(response.content)) as zip_file:
        # Filter for files within the specific subfolder
        subfolder_files = [f for f in zip_file.namelist() if f.startswith(subfolder)]

        # Extract each file, adjusting the path
        for file_path in subfolder_files:
            # Extract only if it's a file (not an empty directory)
            if not file_path.endswith('/'):
                new_path = file_path[len(subfolder):]  # Remove the subfolder part of the path
                with zip_file.open(file_path) as source:
                    data = source.read()
                target_path = f'{dest}/{new_path}'  # Define new extraction path
                # Create target directory if not exists
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                with open(target_path, 'wb') as target_file:
                    target_file.write(data)

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

    download_and_extract("https://github.com/dflook/python-minifier/archive/refs/tags/2.11.0.zip",
                         "python-minifier-2.11.0/src/python_minifier/",
                         "src/tools_vfs/lib/python_minifier")
    gen_tar("src/tools_vfs", "build/assets/tools_vfs.tar.gz")
    gen_tar("src/vm_vfs", "build/assets/vm_vfs.tar.gz")

    # Build
    if not path.isdir("node_modules"):
        run("npm install")
    run("npx eslint")
    run("npm run build")

    # Combine everything
    combine("build/index.html")
    combine("build/bridge.html")
    combine("build/benchmark.html")

    # Cleanup
    #run("rm build/translations.json")
    run("rm build/app.css   build/viper_lib.css")
    run("rm build/app.js    build/viper_lib.js")

    # Add assets from packages
    cp("node_modules/@micropython/micropython-webassembly-pyscript/micropython.wasm", "./build/assets/micropython.wasm")
    cp("node_modules/@micropython/micropython-webassembly-pyscript/micropython.mjs", "./build/micropython.mjs")
    cp("node_modules/@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm", "./build/assets/mpy-cross-v6.wasm")
    cp("node_modules/@astral-sh/ruff-wasm-web/ruff_wasm_bg.wasm", "./build/assets/ruff_wasm_bg.wasm")

    print()
    print("Build complete.")
