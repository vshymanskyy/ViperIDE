/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * Vendored copy of https://micropython.org/resources/boards/index.json (fetched
 * 2026-10-03), bundled rather than fetched at runtime: micropython.org sends no
 * Access-Control-Allow-Origin header, so loading it live would need the same
 * CORS-relaying proxy as the firmware downloads (see firmwareFetchUrl in
 * firmware.js) just to populate a dropdown - not worth the dependency for data
 * this static. Refresh this file together with RELEASES in firmware.js whenever
 * a new MicroPython release is tracked - the three releases there are the ones
 * actually checked against the boards and variants below.
 */
export default [
    {
        "build": "TEENSY40",
        "deploy": [
            "../deploy_teensy.md"
        ],
        "docs": "",
        "features": [
            "External Flash",
            "USB"
        ],
        "id": "TEENSY40",
        "images": [
            "teensy40_front.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "Teensy 4.0",
        "thumbnail": "",
        "url": "https://www.pjrc.com/store/teensy40.html",
        "vendor": "PJRC"
    },
    {
        "build": "PHYBOARD_RT1170",
        "deploy": [
            "../deploy_mimxrt.md"
        ],
        "docs": "",
        "features": [
            "Audio Codec",
            "CAN",
            "Camera",
            "Display",
            "Dual-core",
            "Ethernet",
            "External Flash",
            "External RAM",
            "IMU",
            "RGB LED",
            "USB",
            "microSD"
        ],
        "id": "PHYBOARD_RT1170",
        "images": [
            "phyBOARD-RT1170_front.png"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "phyBOARD-RT1170 Development Kit",
        "thumbnail": "",
        "url": "https://www.phytec.com/product/phyboard-rt1170-development-kit/",
        "vendor": "PHYTEC"
    },
    {
        "build": "MIMXRT1050_EVK",
        "deploy": [
            "../deploy_mimxrt_nouf2.md"
        ],
        "docs": "",
        "features": [
            "Audio Codec",
            "CAN",
            "Ethernet",
            "External Flash",
            "External RAM",
            "Microphone",
            "USB",
            "microSD"
        ],
        "id": "MIMXRT1050_EVK",
        "images": [
            "IMX_RT1050-EVKB_TOP-LR.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "MIMXRT1050_EVK",
        "thumbnail": "",
        "url": "https://www.nxp.com/design/development-boards/i-mx-evaluation-and-development-boards/i-mx-rt1050-evaluation-kit:MIMXRT1050-EVK",
        "vendor": "NXP"
    },
    {
        "build": "MIMXRT1060_EVK",
        "deploy": [
            "../deploy_mimxrt.md"
        ],
        "docs": "",
        "features": [
            "Audio Codec",
            "CAN",
            "Camera",
            "Ethernet",
            "External Flash",
            "External RAM",
            "Microphone",
            "USB",
            "microSD"
        ],
        "id": "MIMXRT1060_EVK",
        "images": [
            "X-MIMXRT1060-EVK-BOARD-BOTTOM.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "MIMXRT1060_EVK",
        "thumbnail": "",
        "url": "https://www.nxp.com/design/development-boards/i-mx-evaluation-and-development-boards/i-mx-rt1060-evaluation-kit:MIMXRT1060-EVK",
        "vendor": "NXP"
    },
    {
        "build": "ADAFRUIT_METRO_M7",
        "deploy": [
            "deploy_metro_m7.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "JST-SH",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "id": "ADAFRUIT_METRO_M7",
        "images": [
            "Metro_M7.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "Metro M7",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/4950",
        "vendor": "Adafruit"
    },
    {
        "build": "MIMXRT1020_EVK",
        "deploy": [
            "../deploy_mimxrt.md"
        ],
        "docs": "",
        "features": [
            "Audio Codec",
            "CAN",
            "Ethernet",
            "External Flash",
            "External RAM",
            "Microphone",
            "USB",
            "microSD"
        ],
        "id": "MIMXRT1020_EVK",
        "images": [
            "MIMXRT-1020-EVKBD.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "MIMXRT1020_EVK",
        "thumbnail": "",
        "url": "https://www.nxp.com/design/development-boards/i-mx-evaluation-and-development-boards/i-mx-rt1020-evaluation-kit:MIMXRT1020-EVK",
        "vendor": "NXP"
    },
    {
        "build": "MIMXRT1015_EVK",
        "deploy": [
            "../deploy_mimxrt.md"
        ],
        "docs": "",
        "features": [
            "Audio Codec",
            "External Flash",
            "Microphone",
            "USB"
        ],
        "id": "MIMXRT1015_EVK",
        "images": [
            "MIMXRT1015-EVK-TOP.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "MIMXRT1015_EVK",
        "thumbnail": "",
        "url": "https://www.nxp.com/design/development-boards/i-mx-evaluation-and-development-boards/i-mx-rt1015-evaluation-kit:MIMXRT1015-EVK",
        "vendor": "NXP"
    },
    {
        "build": "MIMXRT1170_EVK",
        "deploy": [
            "../deploy_mimxrt_nouf2.md"
        ],
        "docs": "",
        "features": [
            "Audio Codec",
            "CAN",
            "Camera",
            "Ethernet",
            "External Flash",
            "External RAM",
            "Microphone",
            "USB",
            "microSD"
        ],
        "id": "MIMXRT1170_EVK",
        "images": [
            "IMX-RT1170-EVK-TOP.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "MIMXRT1170_EVK",
        "thumbnail": "",
        "url": "https://www.nxp.com/design/development-boards/i-mx-evaluation-and-development-boards/i-mx-rt1170-evaluation-kit:MIMXRT1170-EVK",
        "vendor": "NXP"
    },
    {
        "build": "MIMXRT1010_EVK",
        "deploy": [
            "../deploy_mimxrt.md"
        ],
        "docs": "",
        "features": [
            "Audio Codec",
            "External Flash",
            "Microphone",
            "USB"
        ],
        "id": "MIMXRT1010_EVK",
        "images": [
            "i.MXRT1010-TOP.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "MIMXRT1010_EVK",
        "thumbnail": "",
        "url": "https://www.nxp.com/design/development-boards/i-mx-evaluation-and-development-boards/i-mx-rt1010-evaluation-kit:MIMXRT1010-EVK",
        "vendor": "NXP"
    },
    {
        "build": "MAKERDIARY_RT1011_NANO_KIT",
        "deploy": [
            "deploy_makerdiary.md"
        ],
        "docs": "",
        "features": [
            "External Flash",
            "USB",
            "microSD"
        ],
        "id": "MAKERDIARY_RT1011_NANO_KIT",
        "images": [
            "MAKERDIARY_RT1011_NANO_KIT.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "iMX RT1011 Nano Kit",
        "thumbnail": "",
        "url": "https://makerdiary.com/products/imxrt1011-nanokit",
        "vendor": "Makerdiary"
    },
    {
        "build": "OLIMEX_RT1010",
        "deploy": [
            "deploy_olimex.md"
        ],
        "docs": "",
        "features": [
            "External Flash",
            "USB",
            "microSD"
        ],
        "id": "OLIMEX_RT1010",
        "images": [
            "OLIMEX_RT1010Py.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "RT1010-Py",
        "thumbnail": "",
        "url": "https://www.olimex.com/Products/MicroPython/RT1010-Py",
        "vendor": "Olimex"
    },
    {
        "build": "SEEED_ARCH_MIX",
        "deploy": [
            "deploy.md"
        ],
        "docs": "",
        "features": [
            "External Flash",
            "External RAM",
            "RGB LED",
            "USB",
            "microSD"
        ],
        "id": "SEEED_ARCH_MIX",
        "images": [
            "main1.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "Arch Mix",
        "thumbnail": "",
        "url": "https://wiki.seeedstudio.com/Arch_Mix/",
        "vendor": "Seeed Studio"
    },
    {
        "build": "TEENSY41",
        "deploy": [
            "../deploy_teensy.md"
        ],
        "docs": "",
        "features": [
            "Ethernet",
            "External Flash",
            "USB",
            "microSD"
        ],
        "id": "TEENSY41",
        "images": [
            "teensy41_4.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "Teensy 4.1",
        "thumbnail": "",
        "url": "https://www.pjrc.com/store/teensy41.html",
        "vendor": "PJRC"
    },
    {
        "build": "MIMXRT1064_EVK",
        "deploy": [
            "../deploy_mimxrt.md"
        ],
        "docs": "",
        "features": [
            "Audio Codec",
            "CAN",
            "Camera",
            "Ethernet",
            "External Flash",
            "External RAM",
            "Microphone",
            "USB",
            "microSD"
        ],
        "id": "MIMXRT1064_EVK",
        "images": [
            "MIMXRT1064EVK-TOP.jpg"
        ],
        "mcu": "mimxrt",
        "port": "mimxrt",
        "product": "MIMXRT1064_EVK",
        "thumbnail": "",
        "url": "https://www.nxp.com/design/development-boards/i-mx-evaluation-and-development-boards/i-mx-rt1064-evaluation-kit:MIMXRT1064-EVK",
        "vendor": "NXP"
    },
    {
        "build": "LILYGO_T3_S3",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "Display",
            "External Flash",
            "External RAM",
            "LoRa",
            "SDCard",
            "USB-C",
            "WiFi"
        ],
        "id": "LILYGO_T3_S3",
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "T3-S3",
        "thumbnail": "",
        "url": "https://www.lilygo.cc/products/t3s3-v1-0",
        "vendor": "LILYGO"
    },
    {
        "build": "UM_TINYS3",
        "deploy": [
            "../deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "External Flash",
            "External RAM",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "features_non_filterable": [
            "TinyPICO Compatible"
        ],
        "id": "UM_TINYS3",
        "images": [
            "unexpectedmaker_tinys3.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "TinyS3",
        "thumbnail": "",
        "url": "https://tinys3.io",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "SEEED_XIAO_ESP32C6",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "Battery Charging",
            "BLE",
            "External Flash",
            "WiFi",
            "USB",
            "USB-C"
        ],
        "id": "SEEED_XIAO_ESP32C6",
        "images": [
            "seeed_xiao_esp32c6.jpg"
        ],
        "mcu": "esp32c6",
        "port": "esp32",
        "product": "XIAO ESP32C6",
        "url": "https://www.seeedstudio.com/Seeed-Studio-XIAO-ESP32C6-p-5884.html",
        "vendor": "Seeed Studio"
    },
    {
        "build": "ESP32_GENERIC_S3",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "External RAM",
            "WiFi"
        ],
        "id": "ESP32_GENERIC_S3",
        "images": [
            "generic_s3.jpg"
        ],
        "mcu": "esp32s3",
        "old_variants": {
            "FLASH_4M": [
                "4MiB flash",
                "Use the standard variant instead."
            ]
        },
        "port": "esp32",
        "product": "ESP32-S3",
        "thumbnail": "",
        "url": "https://www.espressif.com/en/products/modules",
        "variants": {
            "SPIRAM_OCT": "Support for Octal-SPIRAM"
        },
        "vendor": "Espressif"
    },
    {
        "build": "UM_NANOS3",
        "deploy": [
            "./deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "Battery Charging",
            "RGB LED",
            "External RAM",
            "WiFi",
            "BLE"
        ],
        "features_non_filterable": [
            "TinyPICO Nano Compatible"
        ],
        "id": "UM_NANOS3",
        "images": [
            "unexpectedmaker_nanos3.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "NanoS3",
        "thumbnail": "",
        "url": "https://nanos3.io",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "LOLIN_S2_MINI",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "External Flash",
            "External RAM",
            "USB-C",
            "WiFi"
        ],
        "id": "LOLIN_S2_MINI",
        "images": [
            "lolin_s2_mini.jpg"
        ],
        "mcu": "esp32s2",
        "port": "esp32",
        "product": "S2 mini",
        "thumbnail": "",
        "url": "https://www.wemos.cc/en/latest/s2/s2_mini.html",
        "vendor": "Wemos"
    },
    {
        "build": "UM_FEATHERS3",
        "deploy": [
            "../deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "External Flash",
            "External RAM",
            "Feather",
            "JST-SH",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "features_non_filterable": [],
        "id": "UM_FEATHERS3",
        "images": [
            "unexpectedmaker_feathers3.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "FeatherS3",
        "thumbnail": "",
        "url": "https://feathers3.io",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "SIL_MANT1S",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "External RAM",
            "WiFi"
        ],
        "features_non_filterable": [
            "T1S",
            "10BASE-T1S"
        ],
        "id": "SIL_MANT1S",
        "images": [
            "mant1s-board-top.jpg"
        ],
        "mcu": "esp32",
        "port": "esp32",
        "product": "ManT1S",
        "thumbnail": "",
        "url": "https://mant1s.net/",
        "vendor": "Silicognition LLC"
    },
    {
        "build": "SEEED_XIAO_ESP32C5",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0x2000"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "External RAM",
            "WiFi",
            "USB",
            "USB-C",
            "Battery Charging"
        ],
        "id": "SEEED_XIAO_ESP32C5",
        "images": [
            "seeed_xiao_esp32c5.jpg"
        ],
        "mcu": "esp32c5",
        "port": "esp32",
        "product": "XIAO ESP32C5",
        "url": "https://wiki.seeedstudio.com/xiao_esp32c5_getting_started/",
        "vendor": "Seeed Studio"
    },
    {
        "build": "ESP32_GENERIC_H2",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE"
        ],
        "id": "ESP32_GENERIC_H2",
        "images": [
            "esp32h2_devkitmini.jpg"
        ],
        "mcu": "esp32h2",
        "port": "esp32",
        "product": "ESP32-H2",
        "thumbnail": "",
        "url": "https://www.espressif.com/en/products/modules",
        "vendor": "Espressif"
    },
    {
        "build": "ESP32_GENERIC_S2",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "External Flash",
            "External RAM",
            "WiFi"
        ],
        "id": "ESP32_GENERIC_S2",
        "images": [
            "generic_s2.jpg"
        ],
        "mcu": "esp32s2",
        "port": "esp32",
        "product": "ESP32-S2",
        "thumbnail": "",
        "url": "https://www.espressif.com/en/products/modules",
        "vendor": "Espressif"
    },
    {
        "build": "ESP32_GENERIC_C5",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x2000"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "WiFi"
        ],
        "id": "ESP32_GENERIC_C5",
        "images": [
            "esp32c5_devkitc.jpg"
        ],
        "mcu": "esp32c5",
        "port": "esp32",
        "product": "ESP32-C5",
        "thumbnail": "",
        "url": "https://www.espressif.com/en/products/modules",
        "vendor": "Espressif"
    },
    {
        "build": "GARATRONIC_PYBSTICK26_ESP32C3",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "RGB LED",
            "WiFi"
        ],
        "id": "GARATRONIC_PYBSTICK26_ESP32C3",
        "images": [
            "GAR-PYBSTICK26-C3-mUSB-00.JPG"
        ],
        "mcu": "esp32c3",
        "port": "esp32",
        "product": "PYBSTICK26_ESP32C3",
        "thumbnail": "",
        "url": "https://shop.mchobby.be/fr/pybstick/2505-pybstick26-esp32-c3-micropython-et-arduino-3232100025059.html",
        "vendor": "McHobby"
    },
    {
        "build": "UM_TINYWATCHS3",
        "deploy": [
            "../deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "External Flash",
            "External RAM",
            "USB-C",
            "WiFi"
        ],
        "features_non_filterable": [
            "Watch"
        ],
        "id": "UM_TINYWATCHS3",
        "images": [
            "unexpectedmaker_tinywatchs3.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "TinyWATCH S3",
        "thumbnail": "",
        "url": "https://tinywatch.io",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "UM_TINYC6",
        "deploy": [
            "deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "Battery Charging",
            "BLE",
            "External Flash",
            "WiFi",
            "RGB LED",
            "USB",
            "USB-C"
        ],
        "id": "UM_TINYC6",
        "images": [
            "unexpectedmaker_tinyc6.jpg"
        ],
        "mcu": "esp32c6",
        "port": "esp32",
        "product": "TinyC6",
        "url": "https://tinyc6.io",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "OLIMEX_ESP32_EVB",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "Ethernet",
            "External Flash",
            "WiFi",
            "microSD"
        ],
        "id": "OLIMEX_ESP32_EVB",
        "images": [
            "ESP32-EVB_Rev_K1.png"
        ],
        "mcu": "esp32",
        "port": "esp32",
        "product": "ESP32 EVB",
        "thumbnail": "",
        "url": "https://www.olimex.com/Products/IoT/ESP32/ESP32-EVB",
        "vendor": "Olimex"
    },
    {
        "build": "SEEED_XIAO_ESP32S3",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "External RAM",
            "WiFi",
            "USB",
            "USB-C",
            "Battery Charging"
        ],
        "id": "SEEED_XIAO_ESP32S3",
        "images": [
            "seeed_xiao_esp32s3.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "XIAO ESP32S3",
        "url": "https://www.seeedstudio.com/XIAO-ESP32S3-p-5627.html",
        "vendor": "Seeed Studio"
    },
    {
        "build": "LILYGO_TTGO_LORA32",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "BLE",
            "Display",
            "External Flash",
            "LoRa",
            "SDCard",
            "USB",
            "WiFi"
        ],
        "id": "LILYGO_TTGO_LORA32",
        "images": [
            "lilygo-ttgo-lora-32-v1-6.jpg"
        ],
        "mcu": "esp32",
        "port": "esp32",
        "product": "TTGO LoRa32",
        "thumbnail": "",
        "url": "https://www.lilygo.cc/products/lora3",
        "vendor": "LILYGO"
    },
    {
        "build": "M5STACK_ATOM",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "External Flash",
            "IMU",
            "JST-PH",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "id": "M5STACK_ATOM",
        "images": [
            "m5stack_atom.jpg"
        ],
        "mcu": "esp32",
        "port": "esp32",
        "product": "Atom",
        "thumbnail": "",
        "url": "https://shop.m5stack.com/products/atom-matrix-esp32-development-kit",
        "vendor": "M5Stack"
    },
    {
        "build": "LOLIN_S2_PICO",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "Display",
            "External Flash",
            "External RAM",
            "JST-SH",
            "USB-C",
            "WiFi"
        ],
        "id": "LOLIN_S2_PICO",
        "images": [
            "lolin_s2_pico.jpg"
        ],
        "mcu": "esp32s2",
        "port": "esp32",
        "product": "S2 pico",
        "thumbnail": "",
        "url": "https://www.wemos.cc/en/latest/s2/s2_pico.html",
        "vendor": "Wemos"
    },
    {
        "build": "ESP32_GENERIC",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "WiFi"
        ],
        "id": "ESP32_GENERIC",
        "images": [
            "esp32_devkitc.jpg"
        ],
        "mcu": "esp32",
        "port": "esp32",
        "product": "ESP32 / WROOM",
        "thumbnail": "",
        "url": "https://www.espressif.com/en/products/modules",
        "variants": {
            "D2WD": "ESP32 D2WD",
            "OTA": "Support for OTA",
            "SPIRAM": "Support for SPIRAM / WROVER",
            "UNICORE": "ESP32 Unicore"
        },
        "vendor": "Espressif"
    },
    {
        "build": "UM_FEATHERS2",
        "deploy": [
            "../deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "Battery Charging",
            "External Flash",
            "External RAM",
            "Feather",
            "JST-SH",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "features_non_filterable": [
            "Second LDO"
        ],
        "id": "UM_FEATHERS2",
        "images": [
            "unexpectedmaker_feathers2.jpg"
        ],
        "mcu": "esp32s2",
        "port": "esp32",
        "product": "FeatherS2",
        "thumbnail": "",
        "url": "https://feathers2.io/",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "ESP32_GENERIC_P4",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x2000"
        },
        "docs": "",
        "features": [
            "BLE",
            "WiFi"
        ],
        "id": "ESP32_GENERIC_P4",
        "images": [
            "esp32_p4_function_ev_board.jpg"
        ],
        "mcu": "esp32p4",
        "port": "esp32",
        "product": "ESP32-P4",
        "thumbnail": "",
        "url": "https://www.espressif.com/en/products/modules",
        "variants": {
            "C5_WIFI": "Support for external C5 WiFi/BLE",
            "C6_WIFI": "Support for external C6 WiFi/BLE",
            "PRE_REV3": "Boards with early 0.x and 1.x chip revisions",
            "PRE_REV3_C5_WIFI": "0.x and 1.x chip revisions with external C5 WiFi/BLE",
            "PRE_REV3_C6_WIFI": "0.x and 1.x chip revisions with external C6 WiFi/BLE"
        },
        "vendor": "Espressif"
    },
    {
        "build": "ESP32_GENERIC_C3",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "WiFi"
        ],
        "id": "ESP32_GENERIC_C3",
        "images": [
            "esp32c3_devkitmini.jpg"
        ],
        "mcu": "esp32c3",
        "port": "esp32",
        "product": "ESP32-C3",
        "thumbnail": "",
        "url": "https://www.espressif.com/en/products/modules",
        "vendor": "Espressif"
    },
    {
        "build": "UM_FEATHERS2NEO",
        "deploy": [
            "../deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "Battery Charging",
            "External Flash",
            "External RAM",
            "Feather",
            "JST-SH",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "features_non_filterable": [
            "5x5 RGB LED Matrix"
        ],
        "id": "UM_FEATHERS2NEO",
        "images": [
            "unexpectedmaker_feathers2neo.jpg"
        ],
        "mcu": "esp32s2",
        "port": "esp32",
        "product": "FeatherS2 Neo",
        "thumbnail": "",
        "url": "https://unexpectedmaker.com/feathers2-neo",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "ARDUINO_NANO_ESP32",
        "deploy": [
            "deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "id": "ARDUINO_NANO_ESP32",
        "images": [
            "ABX00092_01.iso_1000x750.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "Nano ESP32",
        "thumbnail": "",
        "url": "https://docs.arduino.cc/hardware/nano-esp32/",
        "vendor": "Arduino"
    },
    {
        "build": "UM_TINYPICO",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "External Flash",
            "External RAM",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "features_non_filterable": [
            "TinyPICO Compatible"
        ],
        "id": "UM_TINYPICO",
        "images": [
            "unexpectedmaker_tinypico.jpg"
        ],
        "mcu": "esp32",
        "port": "esp32",
        "product": "TinyPICO",
        "thumbnail": "",
        "url": "https://www.tinypico.com/",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "UM_FEATHERS3NEO",
        "deploy": [
            "../deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "External Flash",
            "External RAM",
            "Feather",
            "JST-SH",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "features_non_filterable": [],
        "id": "UM_FEATHERS3NEO",
        "images": [
            "unexpectedmaker_feathers3_neo.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "FeatherS3 Neo",
        "thumbnail": "",
        "url": "https://esp32s3.com/feathers3neo.html",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "SEEED_XIAO_ESP32C3",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "WiFi",
            "USB",
            "USB-C",
            "Battery Charging"
        ],
        "id": "SEEED_XIAO_ESP32C3",
        "images": [
            "seeed_xiao_esp32c3.jpg"
        ],
        "mcu": "esp32c3",
        "port": "esp32",
        "product": "XIAO ESP32C3",
        "url": "https://www.seeedstudio.com/Seeed-XIAO-ESP32C3-p-5431.html",
        "vendor": "Seeed Studio"
    },
    {
        "build": "UM_TINYS2",
        "deploy": [
            "../deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "Battery Charging",
            "External Flash",
            "External RAM",
            "JST-SH",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "features_non_filterable": [
            "TinyPICO Compatible"
        ],
        "id": "UM_TINYS2",
        "images": [
            "unexpectedmaker_tinys2.jpg"
        ],
        "mcu": "esp32s2",
        "port": "esp32",
        "product": "TinyS2",
        "thumbnail": "",
        "url": "https://unexpectedmaker.com/tinys2",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "SPARKFUN_THINGPLUS_ESP32C5",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x2000"
        },
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "External Flash",
            "External RAM",
            "Feather",
            "JST-SH",
            "RGB LED",
            "USB-C",
            "WiFi",
            "microSD"
        ],
        "id": "SPARKFUN_THINGPLUS_ESP32C5",
        "images": [
            "30678-Thing-Plus-ESP32-C5-Feature.jpg"
        ],
        "mcu": "esp32c5",
        "port": "esp32",
        "product": "Thing Plus ESP32-C5",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/sparkfun-thing-plus-esp32-c5.html",
        "vendor": "SparkFun"
    },
    {
        "build": "SIL_WESP32",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "BLE",
            "Ethernet",
            "External Flash",
            "PoE",
            "WiFi"
        ],
        "id": "SIL_WESP32",
        "images": [
            "wesp32-iso.jpg",
            "wesp32-top.jpg"
        ],
        "mcu": "esp32",
        "port": "esp32",
        "product": "wESP32",
        "thumbnail": "",
        "url": "https://wesp32.com/",
        "vendor": "Silicognition"
    },
    {
        "build": "WAVESHARE_ESP32_S3_PICO",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "External RAM",
            "WiFi"
        ],
        "id": "WAVESHARE_ESP32_S3_PICO",
        "images": [
            "waveshare_esp32_s3_pico.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "Waveshare ESP32-S3-Pico",
        "thumbnail": "",
        "url": "https://www.waveshare.com/ESP32-S3-Pico.htm",
        "vendor": "Waveshare"
    },
    {
        "build": "LOLIN_C3_MINI",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "USB-C",
            "WiFi"
        ],
        "id": "LOLIN_C3_MINI",
        "images": [
            "lolin_c3_mini.jpg"
        ],
        "mcu": "esp32c3",
        "port": "esp32",
        "product": "C3 mini",
        "thumbnail": "",
        "url": "https://www.wemos.cc/en/latest/c3/c3_mini.html",
        "vendor": "Wemos"
    },
    {
        "build": "SOLDERED_NULA_MINI",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "WiFi",
            "USB-C",
            "JST-PH"
        ],
        "id": "SOLDERED_NULA_MINI",
        "images": [
            "soldered-nula-mini-esp32c6.jpg"
        ],
        "mcu": "esp32c6",
        "port": "esp32",
        "product": "NULA Mini",
        "thumbnail": "",
        "url": "https://soldered.com/product/nula-mini-esp32-c6/",
        "vendor": "Soldered Electronics"
    },
    {
        "build": "OLIMEX_ESP32_POE",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "Ethernet",
            "External Flash",
            "PoE",
            "WiFi",
            "microSD"
        ],
        "id": "OLIMEX_ESP32_POE",
        "images": [
            "ESP32-POE-ISO-1.jpg"
        ],
        "mcu": "esp32",
        "port": "esp32",
        "product": "ESP32 POE",
        "thumbnail": "",
        "url": "https://www.olimex.com/Products/IoT/ESP32/ESP32-POE",
        "vendor": "Olimex"
    },
    {
        "build": "UM_PROS3",
        "deploy": [
            "../deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "External Flash",
            "External RAM",
            "Feather",
            "JST-SH",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "features_non_filterable": [],
        "id": "UM_PROS3",
        "images": [
            "unexpectedmaker_pros3.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "ProS3",
        "thumbnail": "",
        "url": "https://pros3.io",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "ESP32_GENERIC_C2",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "WiFi"
        ],
        "id": "ESP32_GENERIC_C2",
        "images": [
            "esp8684_devkitc.jpg"
        ],
        "mcu": "esp32c2",
        "port": "esp32",
        "product": "ESP32-C2",
        "thumbnail": "",
        "url": "https://www.espressif.com/en/products/modules",
        "variants": {
            "FLASH_2M": "2MiB flash"
        },
        "vendor": "Espressif"
    },
    {
        "build": "M5STACK_ATOMS3_LITE",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "https://docs.m5stack.com/en/core/AtomS3%20Lite",
        "features": [
            "BLE",
            "WiFi",
            "RGB LED",
            "JST-PH",
            "USB-C"
        ],
        "id": "M5STACK_ATOMS3_LITE",
        "images": [
            "atoms3lite.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "AtomS3 Lite",
        "thumbnail": "",
        "url": "https://shop.m5stack.com/products/atoms3-lite-esp32s3-dev-kit",
        "vendor": "M5Stack"
    },
    {
        "build": "SPARKFUN_IOT_REDBOARD_ESP32",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0x1000"
        },
        "docs": "",
        "features": [
            "BLE",
            "External Flash",
            "WiFi",
            "USB-C"
        ],
        "id": "SPARKFUN_IOT_REDBOARD_ESP32",
        "images": [
            "19177-Sparkfun_IoT_Redboard-ESP32.jpg"
        ],
        "mcu": "esp32",
        "port": "esp32",
        "product": "ESP32 / WROOM",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/sparkfun-iot-redboard-esp32-development-board.html",
        "vendor": "SparkFun"
    },
    {
        "build": "UM_OMGS3",
        "deploy": [
            "./deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "Battery Charging",
            "RGB LED",
            "External RAM",
            "WiFi",
            "BLE"
        ],
        "features_non_filterable": [
            "I2C BAT Fuel Gauge"
        ],
        "id": "UM_OMGS3",
        "images": [
            "unexpectedmaker_omgs3.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "OMGS3",
        "thumbnail": "",
        "url": "https://omgs3.io",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "UM_RGBTOUCH_MINI",
        "deploy": [
            "../deploy_flashmode.md",
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "External Flash",
            "External RAM",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "features_non_filterable": [
            "3 Axis IMU",
            "12x12 RGB LED Matrix",
            "Capacitive Touch",
            "I2S Audio Amplifier + Speaker"
        ],
        "id": "UM_RGBTOUCH_MINI",
        "images": [
            "unexpectedmaker_rgbtouch_mini.jpg"
        ],
        "mcu": "esp32s3",
        "port": "esp32",
        "product": "RGB Touch Mini",
        "thumbnail": "",
        "url": "https://rgbtouch.com",
        "vendor": "Unexpected Maker"
    },
    {
        "build": "M5STACK_NANOH2",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "RGB LED",
            "USB",
            "USB-C",
            "JST-PH"
        ],
        "id": "M5STACK_NANOH2",
        "images": [
            "m5stack_nanoh2.jpg"
        ],
        "mcu": "esp32h2",
        "port": "esp32",
        "product": "NanoH2",
        "url": "https://shop.m5stack.com/products/m5stack-nanoh2-dev-kit-esp32-h2",
        "vendor": "M5Stack"
    },
    {
        "build": "M5STACK_NANOC6",
        "deploy": [
            "../deploy_nativeusb.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "WiFi",
            "RGB LED",
            "USB",
            "USB-C",
            "JST-PH"
        ],
        "id": "M5STACK_NANOC6",
        "images": [
            "m5stack_nanoc6.jpg"
        ],
        "mcu": "esp32c6",
        "port": "esp32",
        "product": "NanoC6",
        "url": "https://shop.m5stack.com/products/m5stack-nanoc6-dev-kit",
        "vendor": "M5Stack"
    },
    {
        "build": "ESP32_GENERIC_C6",
        "deploy": [
            "../deploy.md"
        ],
        "deploy_options": {
            "flash_offset": "0"
        },
        "docs": "",
        "features": [
            "BLE",
            "WiFi"
        ],
        "id": "ESP32_GENERIC_C6",
        "images": [
            "esp32c6_devkitmini.jpg"
        ],
        "mcu": "esp32c6",
        "port": "esp32",
        "product": "ESP32-C6",
        "thumbnail": "",
        "url": "https://www.espressif.com/en/products/modules",
        "vendor": "Espressif"
    },
    {
        "build": "ESP8266_GENERIC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "External Flash",
            "WiFi"
        ],
        "id": "ESP8266_GENERIC",
        "images": [
            "esp8266.jpg"
        ],
        "mcu": "esp8266",
        "old_variants": {
            "OTA": [
                "OTA compatible",
                "OTA firmware is no longer supported."
            ]
        },
        "port": "esp8266",
        "product": "ESP8266",
        "thumbnail": "",
        "url": "https://www.espressif.com/en/products/modules",
        "variants": {
            "FLASH_1M": "1MiB flash",
            "FLASH_2M_ROMFS": "2MiB flash with ROMFS",
            "FLASH_512K": "512kiB flash"
        },
        "vendor": "Espressif"
    },
    {
        "build": "CYTRON_MOTION_2350_PRO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "USB-C",
            "RGB LED"
        ],
        "id": "CYTRON_MOTION_2350_PRO",
        "images": [
            "motion-2350-pro.jpg"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "MOTION 2350 Pro",
        "thumbnail": "",
        "url": "https://www.cytron.io/p-motion-2350-pro",
        "variants": {
            "RISCV": "RISC-V CPU mode"
        },
        "vendor": "Cytron"
    },
    {
        "build": "CYTRON_NANOXRP_CONTROLLER",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "IMU",
            "JST-SH",
            "USB",
            "WiFi"
        ],
        "id": "CYTRON_NANOXRP_CONTROLLER",
        "images": [
            "nanoxrp-board.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "NanoXRP Controller",
        "thumbnail": "",
        "url": "https://www.experiential.bot/",
        "vendor": "Cytron"
    },
    {
        "build": "SPARKFUN_THINGPLUS",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Battery Charging",
            "Dual-core",
            "External Flash",
            "Feather",
            "JST-SH",
            "RGB LED",
            "USB-C",
            "microSD"
        ],
        "id": "SPARKFUN_THINGPLUS",
        "images": [
            "17745-SparkFun_Thing_Plus_-_RP2040-01a.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Thing Plus - RP2040",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/products/17745",
        "vendor": "SparkFun"
    },
    {
        "build": "PIMORONI_TINY2040",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "RGB LED",
            "USB-C"
        ],
        "id": "PIMORONI_TINY2040",
        "images": [
            "tiny-2040-on-white-1_1024x1024.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Tiny2040",
        "thumbnail": "",
        "url": "https://shop.pimoroni.com/products/tiny-2040",
        "variants": {
            "FLASH_8M": "8 MiB Flash"
        },
        "vendor": "Pimoroni"
    },
    {
        "build": "WAVESHARE_RP2040_PLUS",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "Battery Charging",
            "External Flash",
            "USB-C"
        ],
        "id": "WAVESHARE_RP2040_PLUS",
        "images": [
            "rp2040-plus-1.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "RP2040-Plus",
        "thumbnail": "",
        "url": "https://www.waveshare.com/rp2040-plus.htm",
        "variants": {
            "FLASH_16M": "16 MiB Flash"
        },
        "vendor": "Waveshare"
    },
    {
        "build": "PIMORONI_PICOLIPO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Battery Charging",
            "Dual-core",
            "External Flash",
            "JST-SH",
            "USB-C"
        ],
        "id": "PIMORONI_PICOLIPO",
        "images": [
            "PimoroniPicoLipo_1of3_1024x1024.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Pico LiPo",
        "thumbnail": "",
        "url": "https://shop.pimoroni.com/products/pimoroni-pico-lipo",
        "variants": {
            "FLASH_16M": "16 MiB Flash"
        },
        "vendor": "Pimoroni"
    },
    {
        "build": "WAVESHARE_RP2040_ZERO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "RGB LED",
            "USB-C"
        ],
        "id": "WAVESHARE_RP2040_ZERO",
        "images": [
            "rp2040-zero-1.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "RP2040-Zero",
        "thumbnail": "",
        "url": "https://www.waveshare.com/product/rp2040-zero.htm",
        "vendor": "Waveshare"
    },
    {
        "build": "SEEED_XIAO_RP2350",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Battery Charging",
            "Dual-core",
            "External Flash",
            "RGB LED",
            "USB"
        ],
        "id": "SEEED_XIAO_RP2350",
        "images": [
            "xiao_rp2350-font.jpg"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "XIAO RP2350",
        "thumbnail": "",
        "url": "https://www.seeedstudio.com/Seeed-XIAO-RP2350-p-5944.html",
        "variants": {
            "RISCV": "RISC-V CPU mode"
        },
        "vendor": "Seeed Studio"
    },
    {
        "build": "ADAFRUIT_ITSYBITSY_RP2040",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "RGB LED",
            "USB"
        ],
        "id": "ADAFRUIT_ITSYBITSY_RP2040",
        "images": [
            "4888-05.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "ItsyBitsy RP2040",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/4888",
        "vendor": "Adafruit"
    },
    {
        "build": "ARDUINO_NANO_RP2040_CONNECT",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "IMU",
            "Microphone",
            "Secure Element",
            "USB",
            "WiFi"
        ],
        "id": "ARDUINO_NANO_RP2040_CONNECT",
        "images": [
            "ABX00052_01.iso_999x750.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Nano RP2040 Connect",
        "thumbnail": "",
        "url": "https://store-usa.arduino.cc/products/arduino-nano-rp2040-connect",
        "vendor": "Arduino"
    },
    {
        "build": "W5500_EVB_PICO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "Ethernet",
            "External Flash",
            "USB"
        ],
        "id": "W5500_EVB_PICO",
        "images": [
            "W5500-EVB-Pico.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "W5500-EVB-Pico",
        "thumbnail": "",
        "url": "https://docs.wiznet.io/Product/iEthernet/W5500/w5500-evb-pico",
        "vendor": "WIZnet"
    },
    {
        "build": "SPARKFUN_XRP_CONTROLLER",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "External RAM",
            "IMU",
            "JST-SH",
            "RGB LED",
            "USB-C",
            "WiFi"
        ],
        "id": "SPARKFUN_XRP_CONTROLLER",
        "images": [
            "26619-XRP-Controller-Board-Feature.jpg"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "XRP Controller",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/sparkfun-experiential-robotics-platform-xrp-controller.html",
        "variants": {
            "RISCV": "RISC-V CPU mode"
        },
        "vendor": "SparkFun"
    },
    {
        "build": "SPARKFUN_IOTNODE_LORAWAN_RP2350",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Battery Charging",
            "Dual-core",
            "External Flash",
            "External RAM",
            "JST-SH",
            "LoRa",
            "RGB LED",
            "USB-C",
            "microSD"
        ],
        "id": "SPARKFUN_IOTNODE_LORAWAN_RP2350",
        "images": [
            "26060-IoT-Node-LoRaWAN-Feature-new.jpg"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "IoT Node LoRaWAN RP2350",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/products/26060",
        "variants": {
            "RISCV": "RISC-V CPU mode"
        },
        "vendor": "SparkFun"
    },
    {
        "build": "SPARKFUN_IOTREDBOARD_RP2350",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "USB-C",
            "WiFi",
            "External RAM",
            "microSD",
            "RGB LED",
            "JST-SH",
            "Battery Charging"
        ],
        "id": "SPARKFUN_IOTREDBOARD_RP2350",
        "images": [
            "27708-IoT-RedBoard-RP2350-Feature.jpg"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "SparkFun IoT RedBoard RP2350",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/sparkfun-iot-redboard-rp2350.html",
        "variants": {
            "RISCV": "RISC-V CPU mode"
        },
        "vendor": "SparkFun"
    },
    {
        "build": "MACHDYNE_WERKZEUG",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "USB-C"
        ],
        "id": "MACHDYNE_WERKZEUG",
        "images": [
            "werkzeug.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Werkzeug",
        "thumbnail": "",
        "url": "https://machdyne.com/product/werkzeug-multi-tool/",
        "vendor": "Machdyne"
    },
    {
        "build": "W5100S_EVB_PICO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "Ethernet",
            "External Flash",
            "USB"
        ],
        "id": "W5100S_EVB_PICO",
        "images": [
            "W5100S-EVB-Pico.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "W5100S-EVB-Pico",
        "thumbnail": "",
        "url": "https://docs.wiznet.io/Product/iEthernet/W5100S/w5100s-evb-pico",
        "vendor": "WIZnet"
    },
    {
        "build": "SPARKFUN_THINGPLUS_RP2350",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "Dual-core",
            "External Flash",
            "External RAM",
            "Feather",
            "JST-SH",
            "RGB LED",
            "USB-C",
            "WiFi",
            "microSD"
        ],
        "id": "SPARKFUN_THINGPLUS_RP2350",
        "images": [
            "25134-Thing-Plus-RP2350-Feature.jpg"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "Thing Plus RP2350",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/products/25134",
        "variants": {
            "RISCV": "RISC-V CPU mode"
        },
        "vendor": "SparkFun"
    },
    {
        "build": "ADAFRUIT_FEATHER_RP2350",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Battery Charging",
            "Dual-core",
            "External Flash",
            "Feather",
            "JST-SH",
            "RGB LED",
            "USB-C"
        ],
        "id": "ADAFRUIT_FEATHER_RP2350",
        "images": [
            "6000-07.jpg"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "Feather RP2350",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/6000",
        "variants": {
            "RISCV": "RISC-V CPU mode"
        },
        "vendor": "Adafruit"
    },
    {
        "build": "ADAFRUIT_QTPY_RP2040",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "JST-SH",
            "RGB LED",
            "USB-C"
        ],
        "id": "ADAFRUIT_QTPY_RP2040",
        "images": [
            "4900-12.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "QT Py RP2040",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/4900",
        "vendor": "Adafruit"
    },
    {
        "build": "RPI_PICO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "USB"
        ],
        "id": "RPI_PICO",
        "images": [
            "rp2-pico.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Pico",
        "thumbnail": "",
        "url": "https://www.raspberrypi.com/products/raspberry-pi-pico/",
        "vendor": "Raspberry Pi"
    },
    {
        "build": "GARATRONIC_PYBSTICK26_RP2040",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "RGB LED",
            "USB"
        ],
        "id": "GARATRONIC_PYBSTICK26_RP2040",
        "images": [
            "pybstick-rp2040-26-broches-micropython-c.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "RP2040 PYBStick",
        "thumbnail": "",
        "url": "https://shop.mchobby.be/product.php?id_product=2331",
        "vendor": "McHobby"
    },
    {
        "build": "NULLBITS_BIT_C_PRO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "RGB LED",
            "USB-C"
        ],
        "id": "NULLBITS_BIT_C_PRO",
        "images": [
            "nullbits_bit_c_pro.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Bit-C PRO",
        "thumbnail": "",
        "url": "https://nullbits.co/bit-c-pro",
        "vendor": "nullbits"
    },
    {
        "build": "SOLDERED_NULA_MAX_RP2350",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "USB-C",
            "WiFi",
            "microSD",
            "RGB LED",
            "JST-SH",
            "Battery Charging"
        ],
        "id": "SOLDERED_NULA_MAX_RP2350",
        "images": [
            "soldered-nula-rp2350.jpg"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "NULA RP2350",
        "thumbnail": "",
        "url": "https://soldered.com/product/nula-max-rp2350/",
        "vendor": "Soldered Electronics"
    },
    {
        "build": "POLOLU_ZUMO_2040_ROBOT",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "USB-C",
            "JST-SH",
            "IMU",
            "RGB LED",
            "Display",
            "Dual-core",
            "External Flash"
        ],
        "id": "POLOLU_ZUMO_2040_ROBOT",
        "images": [
            "pololu_zumo_2040_robot.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Zumo 2040 Robot",
        "thumbnail": "",
        "url": "https://www.pololu.com/zumo",
        "vendor": "Pololu"
    },
    {
        "build": "SIL_RP2040_SHIM",
        "deploy": [
            "deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "RGB LED",
            "External Flash",
            "USB"
        ],
        "id": "SIL_RP2040_SHIM",
        "images": [
            "rp2040-shim-product.jpg",
            "RP2040-Shim-pinout.png"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "RP2040-Shim",
        "thumbnail": "",
        "url": "https://silicognition.com/Products/rp2040-shim/",
        "vendor": "Silicognition LLC"
    },
    {
        "build": "WAVESHARE_RP2040_LCD_0_96",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "Battery Charging",
            "External Flash",
            "Display",
            "USB-C"
        ],
        "id": "WAVESHARE_RP2040_LCD_0_96",
        "images": [
            "rp2040-lcd-0.96-1.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "RP2040-LCD-0.96",
        "thumbnail": "",
        "url": "https://www.waveshare.com/product/rp2040-lcd-0.96.htm",
        "vendor": "Waveshare"
    },
    {
        "build": "RPI_PICO2_W",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "USB",
            "WiFi"
        ],
        "id": "RPI_PICO2_W",
        "images": [
            "rp2-pico2-w.jpg"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "Pico 2 W",
        "thumbnail": "",
        "url": "https://www.raspberrypi.com/products/raspberry-pi-pico-2/",
        "variants": {
            "RISCV": "RISC-V CPU mode"
        },
        "vendor": "Raspberry Pi"
    },
    {
        "build": "RPI_PICO2",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "USB"
        ],
        "id": "RPI_PICO2",
        "images": [
            "rp2-pico2.jpg"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "Pico 2",
        "thumbnail": "",
        "url": "https://www.raspberrypi.com/products/raspberry-pi-pico-2/",
        "variants": {
            "RISCV": "RISC-V CPU mode"
        },
        "vendor": "Raspberry Pi"
    },
    {
        "build": "POLOLU_3PI_2040_ROBOT",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "USB-C",
            "IMU",
            "RGB LED",
            "Display",
            "Dual-core",
            "External Flash"
        ],
        "id": "POLOLU_3PI_2040_ROBOT",
        "images": [
            "pololu_3pi_2040_robot.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "3pi+ 2040 Robot",
        "thumbnail": "",
        "url": "https://www.pololu.com/3pi",
        "vendor": "Pololu"
    },
    {
        "build": "WEACTSTUDIO_RP2350B_CORE",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "External RAM",
            "USB-C"
        ],
        "id": "WEACTSTUDIO_RP2350B_CORE",
        "images": [
            "weactstudio_rp2350_core.png"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "RP2350B Core",
        "thumbnail": "",
        "url": "https://github.com/WeActStudio/WeActStudio.RP2350BCoreBoard",
        "variants": {
            "RISCV": "RISC V"
        },
        "vendor": "WeAct Studio"
    },
    {
        "build": "SPARKFUN_PROMICRO_RP2350",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "External RAM",
            "JST-SH",
            "RGB LED",
            "USB-C"
        ],
        "id": "SPARKFUN_PROMICRO_RP2350",
        "images": [
            "DEV-24870-Pro-Micro-RP2350-Feature.jpg"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "Pro Micro RP2350",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/products/24870",
        "variants": {
            "RISCV": "RISC-V CPU mode"
        },
        "vendor": "SparkFun"
    },
    {
        "build": "WEACTSTUDIO",
        "deploy": [
            "deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "USB-C"
        ],
        "id": "WEACTSTUDIO",
        "images": [
            "weact_rp2040.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Studio RP2040",
        "url": "https://github.com/WeActTC/WeActStudio.RP2040CoreBoard",
        "variants": {
            "FLASH_2M": "2 MiB Flash",
            "FLASH_4M": "4 MiB Flash",
            "FLASH_8M": "8 MiB Flash"
        },
        "vendor": "WeAct"
    },
    {
        "build": "SEEED_XIAO_RP2040",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "RGB LED",
            "USB",
            "USB-C"
        ],
        "id": "SEEED_XIAO_RP2040",
        "images": [
            "seeedstudio_xiao_rp2040.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "XIAO RP2040",
        "url": "https://www.seeedstudio.com/XIAO-RP2040-v1-0-p-5026.html",
        "vendor": "Seeed Studio"
    },
    {
        "build": "RPI_PICO_W",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "USB",
            "WiFi"
        ],
        "id": "RPI_PICO_W",
        "images": [
            "rp2-pico-w.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Pico W",
        "thumbnail": "",
        "url": "https://www.raspberrypi.com/products/raspberry-pi-pico/",
        "vendor": "Raspberry Pi"
    },
    {
        "build": "SPARKFUN_PROMICRO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "JST-SH",
            "RGB LED",
            "USB-C"
        ],
        "id": "SPARKFUN_PROMICRO",
        "images": [
            "18288-SparkFun_Pro_Micro_-_RP2040-01.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Pro Micro - RP2040",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/products/18288",
        "vendor": "SparkFun"
    },
    {
        "build": "ADAFRUIT_FEATHER_RP2040",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Battery Charging",
            "Dual-core",
            "External Flash",
            "Feather",
            "JST-SH",
            "RGB LED",
            "USB-C"
        ],
        "id": "ADAFRUIT_FEATHER_RP2040",
        "images": [
            "4884-06.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "Feather RP2040",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/4884",
        "vendor": "Adafruit"
    },
    {
        "build": "SPARKFUN_XRP_CONTROLLER_BETA",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "IMU",
            "JST-SH",
            "USB",
            "WiFi"
        ],
        "id": "SPARKFUN_XRP_CONTROLLER_BETA",
        "images": [
            "22727-_01.jpg"
        ],
        "mcu": "rp2040",
        "port": "rp2",
        "product": "XRP Controller (Beta)",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/sparkfun-experiential-robotics-platform-xrp-controller-beta.html",
        "vendor": "SparkFun"
    },
    {
        "build": "WAVESHARE_RP2350B_CORE",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Dual-core",
            "External Flash",
            "External RAM",
            "USB-C"
        ],
        "id": "WAVESHARE_RP2350B_CORE",
        "images": [
            "waveshare_rp2350b_core.png"
        ],
        "mcu": "rp2350",
        "port": "rp2",
        "product": "RP2350B Core",
        "thumbnail": "",
        "url": "https://www.waveshare.com/core2350b.htm",
        "variants": {
            "RISCV": "RISC V"
        },
        "vendor": "Waveshare"
    },
    {
        "build": "EK_RA6M1",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "EK_RA6M1",
        "images": [
            "ek_ra6m1_board.jpg"
        ],
        "mcu": "ra6m1",
        "port": "renesas-ra",
        "product": "EK-RA6M1",
        "thumbnail": "",
        "url": "https://www.renesas.com/products/microcontrollers-microprocessors/ra-cortex-m-mcus/ek-ra6m1-evaluation-kit-ra6m1-mcu-group",
        "vendor": "Renesas Electronics"
    },
    {
        "build": "ARDUINO_PORTENTA_C33",
        "deploy": [
            "./deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Ethernet",
            "External Flash",
            "Secure Element",
            "USB-C",
            "WiFi"
        ],
        "id": "ARDUINO_PORTENTA_C33",
        "images": [
            "ABX00074_01.iso_1000x750.jpg"
        ],
        "mcu": "RA6M5",
        "port": "renesas-ra",
        "product": "Portenta C33",
        "thumbnail": "",
        "url": "https://store.arduino.cc/pages/portenta-c33",
        "vendor": "Arduino"
    },
    {
        "build": "VK_RA6M5",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "DAC"
        ],
        "id": "VK_RA6M5",
        "images": [
            "VK-RA6M5.jpg"
        ],
        "mcu": "ra6m5",
        "port": "renesas-ra",
        "product": "VK-RA6M5",
        "thumbnail": "",
        "url": "https://vekatech.com/VK-RA6M5_docs/brochures/VK-RA6M5%20Flyer%20R2.pdf",
        "vendor": "Vekatech"
    },
    {
        "build": "EK_RA6M2",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "EK_RA6M2",
        "images": [
            "ek_ra6m2_board.jpg",
            "ek_ra6m2_j1_pins.jpg",
            "ek_ra6m2_j2_pins.jpg",
            "ek_ra6m2_j3_pins.jpg",
            "ek_ra6m2_j4_pins.jpg"
        ],
        "mcu": "ra6m2",
        "port": "renesas-ra",
        "product": "EK-RA6M2",
        "thumbnail": "",
        "url": "https://www.renesas.com/products/microcontrollers-microprocessors/ra-cortex-m-mcus/ek-ra6m2-evaluation-kit-ra6m2-mcu-group",
        "vendor": "Renesas Electronics"
    },
    {
        "build": "EK_RA4M1",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "EK_RA4M1",
        "images": [
            "ek_ra4m1_board.jpg"
        ],
        "mcu": "ra4m1",
        "port": "renesas-ra",
        "product": "EK-RA4M1",
        "thumbnail": "",
        "url": "https://www.renesas.com/products/microcontrollers-microprocessors/ra-cortex-m-mcus/ek-ra4m1-evaluation-kit-ra4m1-mcu-group",
        "vendor": "Renesas Electronics"
    },
    {
        "build": "RA4M1_CLICKER",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "RA4M1_CLICKER",
        "images": [
            "ra4m1_clicker_board.jpg",
            "ra4m1_clicker_pins.jpg"
        ],
        "mcu": "ra4m1",
        "port": "renesas-ra",
        "product": "Mikroe RA4M1 Clicker",
        "thumbnail": "",
        "url": "https://www.mikroe.com/ra4m1-clicker",
        "vendor": "MikroElektronika"
    },
    {
        "build": "EK_RA4W1",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "EK_RA4W1",
        "images": [
            "ek_ra4w1_board.jpg"
        ],
        "mcu": "ra4w1",
        "port": "renesas-ra",
        "product": "EK-RA4W1",
        "thumbnail": "",
        "url": "https://www.renesas.com/products/microcontrollers-microprocessors/ra-cortex-m-mcus/ek-ra4w1-evaluation-kit-ra4w1-mcu-group",
        "vendor": "Renesas Electronics"
    },
    {
        "build": "FEATHER52",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "FEATHER52",
        "images": [
            "4062-02.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "Feather nRF52840 Express",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/4062",
        "vendor": "Adafruit"
    },
    {
        "build": "PCA10031",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PCA10031",
        "images": [
            "nRF51-Dongle.jpg"
        ],
        "mcu": "nrf51",
        "port": "nrf",
        "product": "pca10031",
        "thumbnail": "",
        "url": "https://www.nordicsemi.com/Products/Development-hardware/nRF51-Dongle",
        "vendor": "Nordic Semiconductor"
    },
    {
        "build": "PARTICLE_XENON",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PARTICLE_XENON",
        "images": [
            "xenon-top.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "Xenon",
        "thumbnail": "",
        "url": "https://docs.particle.io/xenon/",
        "vendor": "Particle"
    },
    {
        "build": "IDK_BLYST_NANO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "IDK_BLYST_NANO",
        "images": [
            "blyst-nano-fingertip-close_jpg_content-body-gallery.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "IDK BLYST Nano",
        "thumbnail": "",
        "url": "https://www.i-syst.com/products/blyst-nano",
        "vendor": "I-SYST"
    },
    {
        "build": "ARDUINO_PRIMO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "ARDUINO_PRIMO",
        "images": [
            "arduino_primo.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "Primo",
        "thumbnail": "",
        "url": "https://docs.arduino.cc/retired/boards/arduino-primo/",
        "vendor": "Arduino"
    },
    {
        "build": "EVK_NINA_B1",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "https://www.u-blox.com/sites/default/files/EVK-NINA-B1_UserGuide_%28UBX-15028120%29.pdf",
        "features": [],
        "id": "EVK_NINA_B1",
        "images": [
            "EVK-NINA-B1_.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "EVK-NINA-B1",
        "thumbnail": "",
        "url": "https://www.u-blox.com/en/product/evk-nina-b1",
        "vendor": "u-blox"
    },
    {
        "build": "PCA10056",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PCA10056",
        "images": [
            "nRF52840-DK-prod-page.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "pca10056",
        "thumbnail": "",
        "url": "https://www.nordicsemi.com/Products/Development-hardware/nRF52840-DK",
        "vendor": "Nordic Semiconductor"
    },
    {
        "build": "ARDUINO_NANO_33_BLE_SENSE",
        "deploy": [
            "./deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Environment Sensor",
            "IMU",
            "Microphone",
            "Secure Element",
            "USB"
        ],
        "id": "ARDUINO_NANO_33_BLE_SENSE",
        "images": [
            "ABX00031_01.iso_998x749.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "Nano 33 BLE Sense",
        "thumbnail": "",
        "url": "https://store.arduino.cc/products/arduino-nano-33-ble-sense",
        "vendor": "Arduino"
    },
    {
        "build": "PCA10028",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PCA10028",
        "images": [
            "nRF51-DK.jpg"
        ],
        "mcu": "nrf51",
        "port": "nrf",
        "product": "pca10028",
        "thumbnail": "",
        "url": "https://www.nordicsemi.com/Products/Development-hardware/nRF51-DK",
        "vendor": "Nordic Semiconductor"
    },
    {
        "build": "WT51822_S4AT",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "https://4tronix.co.uk/picobot2/WT51822-S4AT.pdf",
        "features": [],
        "id": "WT51822_S4AT",
        "images": [
            "WT51822-S4AT.jpg"
        ],
        "mcu": "nrf51",
        "port": "nrf",
        "product": "WT51822-S4AT",
        "thumbnail": "",
        "url": "https://shop.wireless-tag.com/products/esp32-c3-mini-1-10pcs-espressif-esp32-c3-mini-1-4mb-flash-pcb-antenna-15-gpios-wifi-ble-5-module-esp32-c3-module-on-esp32-c3-chip",
        "vendor": "Wireless-Tag"
    },
    {
        "build": "DVK_BL652",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "DVK_BL652",
        "images": [
            "BL652-SA_JPG-500.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "DVK-BL652",
        "thumbnail": "",
        "url": "https://www.ezurio.com/wireless-modules/bluetooth-modules/bluetooth-5-modules/bl652-series-bluetooth-v5-nfc-module",
        "vendor": "Ezurio"
    },
    {
        "build": "IBK_BLYST_NANO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "IBK_BLYST_NANO",
        "images": [
            "blyst-nano-fingertip-close_jpg_content-body-gallery.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "IBK BLYST Nano",
        "thumbnail": "",
        "url": "https://www.i-syst.com/products/blyst-nano",
        "vendor": "I-SYST"
    },
    {
        "build": "PCA10000",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PCA10000",
        "images": [
            "nRF51-Dongle.jpg"
        ],
        "mcu": "nrf51",
        "port": "nrf",
        "product": "pca10000",
        "thumbnail": "",
        "url": "https://www.nordicsemi.com/Products/Development-hardware/nRF51-Dongle",
        "vendor": "Nordic Semiconductor"
    },
    {
        "build": "ACTINIUS_ICARUS",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "ACTINIUS_ICARUS",
        "images": [
            "icarus-v1.4-front-shadow-p-800.jpg"
        ],
        "mcu": "nrf91",
        "port": "nrf",
        "product": "Icarus",
        "thumbnail": "",
        "url": "https://www.actinius.com/icarus",
        "vendor": "Actinius"
    },
    {
        "build": "EVK_NINA_B3",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "EVK_NINA_B3",
        "images": [
            "EVK-NINA-B3-top.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "EVK-NINA-B3",
        "thumbnail": "",
        "url": "https://www.u-blox.com/en/product/evk-nina-b3",
        "vendor": "u-blox"
    },
    {
        "build": "BLUEIO_TAG_EVIM",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "BLUEIO_TAG_EVIM",
        "images": [
            "blyst-nano-mod-4_jpg_project-body.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "BLUEIO Tag EVIM",
        "thumbnail": "",
        "url": "https://www.i-syst.com/index.php/products/blyst-nano",
        "vendor": "I-SYST"
    },
    {
        "build": "PCA10059",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PCA10059",
        "images": [
            "pca10059.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "pca10059",
        "thumbnail": "",
        "url": "https://www.nordicsemi.com/Products/Development-hardware/nRF52840-Dongle",
        "vendor": "Nordic Semiconductor"
    },
    {
        "build": "NRF52840_MDK_USB_DONGLE",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NRF52840_MDK_USB_DONGLE",
        "images": [
            "dongle_pcba_case.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "nrf52840 MDK USB Dongle",
        "thumbnail": "",
        "url": "https://wiki.makerdiary.com/nrf52840-mdk-usb-dongle",
        "vendor": "Makerdiary"
    },
    {
        "build": "PCA10090",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PCA10090",
        "images": [
            "nRF59160-DK-prod-page.jpg"
        ],
        "mcu": "nrf91",
        "port": "nrf",
        "product": "pca10090",
        "thumbnail": "",
        "url": "https://www.nordicsemi.com/Products/Development-hardware/nrf9160-dk",
        "vendor": "Nordic Semiconductor"
    },
    {
        "build": "PCA10001",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PCA10001",
        "images": [
            "nRF51-DK.jpg"
        ],
        "mcu": "nrf51",
        "port": "nrf",
        "product": "pca10001",
        "thumbnail": "",
        "url": "https://www.nordicsemi.com/Products/Development-hardware/nrf51-dk",
        "vendor": "Nordic Semiconductor"
    },
    {
        "build": "SEEED_XIAO_NRF52",
        "deploy": [
            "deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Battery Charging",
            "External Flash",
            "IMU",
            "Microphone",
            "RGB LED",
            "USB-C"
        ],
        "id": "SEEED_XIAO_NRF52",
        "images": [
            "XIAO_nrf52840_front.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "XIAO nRF52840 Sense",
        "thumbnail": "",
        "url": "https://www.seeedstudio.com/Seeed-XIAO-BLE-Sense-nRF52840-p-5253.html",
        "vendor": "Seeed Studio"
    },
    {
        "build": "PCA10040",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PCA10040",
        "images": [
            "nRF52-DK-prod-page.jpg"
        ],
        "mcu": "nrf52",
        "port": "nrf",
        "product": "pca10040",
        "thumbnail": "",
        "url": "https://www.nordicsemi.com/Products/Development-hardware/nRF52-DK",
        "vendor": "Nordic Semiconductor"
    },
    {
        "build": "MICROBIT",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "MICROBIT",
        "images": [
            "AF-3362-1.jpg"
        ],
        "mcu": "nrf51",
        "port": "nrf",
        "product": "micro:bit v1",
        "thumbnail": "",
        "url": "https://microbit.org/",
        "vendor": "BBC"
    },
    {
        "build": "WIPY",
        "deploy": [
            "deploy.md"
        ],
        "docs": "https://docs.pycom.io/datasheets/development/wipy3/",
        "features": [
            "BLE",
            "External Flash",
            "RGB LED",
            "WiFi",
            "microSD"
        ],
        "id": "WIPY",
        "images": [
            "wipy.jpg"
        ],
        "mcu": "cc3200",
        "port": "cc3200",
        "product": "WiPy Module",
        "thumbnail": "",
        "url": "https://pycom.io/product/wipy-3-0/",
        "vendor": "Pycom"
    },
    {
        "build": "NUCLEO_H743ZI2",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_H743ZI2",
        "images": [
            "nucleo_h743zi2.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Nucleo H743ZI2",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "WEACT_F411_BLACKPILL",
        "deploy": [
            "../PYBV10/deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "WEACT_F411_BLACKPILL",
        "images": [
            "WEACTV20_F411.jpg"
        ],
        "mcu": "stm32f411",
        "port": "stm32",
        "product": "WeAct F411 'blackpill'. Default variant is v3.1 with no SPI Flash.",
        "thumbnail": "",
        "url": "https://github.com/WeActStudio/WeActStudio.MiniSTM32F4x1",
        "variants": {
            "V13": "v1.3 board with no SPI Flash",
            "V13_FLASH_4M": "v1.3 board with 4MB SPI Flash",
            "V20_FLASH_4M": "v2.0 board with 4MB SPI Flash",
            "V31_FLASH_8M": "v3.1 board with 8MB SPI Flash",
            "V31_XTAL_8M": "v3.1 board with 8MHz crystal"
        },
        "vendor": "WeAct Studio"
    },
    {
        "build": "GARATRONIC_NADHAT_F405",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "GARATRONIC_NADHAT_F405",
        "images": [
            "garatronic_nadhat_f405.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "GARATRONIC_NADHAT_F405",
        "thumbnail": "",
        "url": "https://shop.mchobby.be/product.php?id_product=1653",
        "vendor": "McHobby"
    },
    {
        "build": "NUCLEO_F722ZE",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F722ZE",
        "images": [
            "nucleo_f722ze.jpg"
        ],
        "mcu": "stm32f7",
        "port": "stm32",
        "product": "Nucleo F722ZE",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "PYBLITEV10",
        "deploy": [
            "../PYBV10/deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PYBLITEV10",
        "images": [
            "PYBLITEv1_0.jpg",
            "PYBLITEv1_0-B.jpg",
            "PYBLITEv1_0-C.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Pyboard Lite v1.0",
        "thumbnail": "",
        "url": "https://store.micropython.org/product/PYBLITEv1.0",
        "variants": {
            "DP": "Double-precision float",
            "DP_THREAD": "Double precision float + Threads",
            "NETWORK": "Wiznet 5200 Driver",
            "THREAD": "Threading"
        },
        "vendor": "George Robotics"
    },
    {
        "build": "NUCLEO_L432KC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_L432KC",
        "images": [
            "nucleo_l432kc.jpg"
        ],
        "mcu": "stm32l4",
        "port": "stm32",
        "product": "Nucleo L432KC",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "B_L475E_IOT01A",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "B_L475E_IOT01A",
        "images": [
            "b-l475e-iot01a-discovery.jpg"
        ],
        "mcu": "stm32l4",
        "port": "stm32",
        "product": "B_L475E_IOT01A",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/b-l475e-iot01a.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_L476RG",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_L476RG",
        "images": [
            "nucleo_l476rg.jpg"
        ],
        "mcu": "stm32l4",
        "port": "stm32",
        "product": "Nucleo L476RG",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_L073RZ",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_L073RZ",
        "images": [
            "nucleo_l073rz.jpg"
        ],
        "mcu": "stm32l0",
        "port": "stm32",
        "product": "Nucleo L073RZ",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "CERB40",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "CERB40",
        "images": [
            "cerb40.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Cerb40",
        "thumbnail": "",
        "url": "",
        "vendor": "Fez"
    },
    {
        "build": "VCC_GND_F407VE",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "VCC_GND_F407VE",
        "images": [
            "STM32F407VET6.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "F407VE",
        "thumbnail": "",
        "url": "http://vcc-gnd.com/",
        "vendor": "VCC-GND Studio"
    },
    {
        "build": "LEGO_HUB_NO6",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "LEGO_HUB_NO6",
        "images": [
            "lego_hub_6.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Hub No.6",
        "thumbnail": "",
        "url": "",
        "vendor": "LEGO"
    },
    {
        "build": "ARDUINO_PORTENTA_H7",
        "deploy": [
            "./deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "Ethernet",
            "External Flash",
            "External RAM",
            "USB",
            "WiFi"
        ],
        "id": "ARDUINO_PORTENTA_H7",
        "images": [
            "ABX00042_01.iso_1000x750.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Portenta H7",
        "thumbnail": "",
        "url": "https://store.arduino.cc/products/portenta-h7",
        "vendor": "Arduino"
    },
    {
        "build": "HYDRABUS",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "HYDRABUS",
        "images": [
            "hydrabus.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "HydraBus v1.0",
        "thumbnail": "",
        "url": "https://github.com/hydrabus/hydrabus",
        "vendor": "HydraBus"
    },
    {
        "build": "ESPRUINO_PICO",
        "deploy": [
            "deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "ESPRUINO_PICO",
        "images": [
            "Pico_angled.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Pico",
        "thumbnail": "",
        "url": "https://www.espruino.com/Pico",
        "vendor": "Espruino"
    },
    {
        "build": "NUCLEO_WL55",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_WL55",
        "images": [
            "nucleo_wl55.jpg"
        ],
        "mcu": "stm32wl",
        "port": "stm32",
        "product": "Nucleo WL55",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/nucleo-wl55jc.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "STM32F429DISC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "STM32F429DISC",
        "images": [
            "stm32f429disc.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Discovery F429",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_F413ZH",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F413ZH",
        "images": [
            "nucleo_f413zh.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Nucleo F413ZH",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "GARATRONIC_PYMATE_CORE8ADI8DOSC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "GARATRONIC_PYMATE_CORE8ADI8DOSC",
        "images": [
            "PyMateIO_Core.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "GARATRONIC_PYMATE_CORE8ADI8DOSC",
        "thumbnail": "",
        "url": "https://www.pymate.io/product/pymateio-core-8-digital-analog-inputs-8-digital-outputs-rs485-port-can-port/",
        "vendor": "PyMateIO"
    },
    {
        "build": "STM32L476DISC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "STM32L476DISC",
        "images": [
            "stm32l476disc.jpg"
        ],
        "mcu": "stm32l4",
        "port": "stm32",
        "product": "Discovery L476",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "PYBD_SF6",
        "deploy": [
            "../PYBD_SF2/deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "WiFi"
        ],
        "id": "PYBD_SF6",
        "images": [
            "PYBD_SF6_W4F2.jpg",
            "PYBD_SF6_W4F2_top.jpg",
            "PYBD_SF2_W4F2_bot.jpg",
            "PYBD_SF6_W4F2_ds1.jpg",
            "PYBD_SF6_W4F2_ds2.jpg",
            "PYBD_SF6_W4F2_ds3.jpg"
        ],
        "mcu": "stm32f7",
        "port": "stm32",
        "product": "Pyboard D-series SF6",
        "thumbnail": "",
        "url": "https://store.micropython.org/product/PYBD-SF6-W4F2",
        "vendor": "George Robotics"
    },
    {
        "build": "NUCLEO_F429ZI",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F429ZI",
        "images": [
            "nucleo_f429zi.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Nucleo F429ZI",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "LEGO_HUB_NO7",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "LEGO_HUB_NO7",
        "images": [
            "lego_hub_7.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Hub No.7",
        "thumbnail": "",
        "url": "",
        "vendor": "LEGO"
    },
    {
        "build": "STM32F7DISC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "STM32F7DISC",
        "images": [
            "stm32f7disc.jpg"
        ],
        "mcu": "stm32f7",
        "port": "stm32",
        "product": "Discovery F7",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "ARDUINO_OPTA",
        "deploy": [
            "./deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "USB",
            "WiFi"
        ],
        "id": "ARDUINO_OPTA",
        "images": [
            "AFX00002_01.iso_1000x750.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Opta WiFi",
        "thumbnail": "",
        "url": "https://store.arduino.cc/products/opta-wifi",
        "vendor": "Arduino"
    },
    {
        "build": "NUCLEO_U5A5ZJ_Q",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_U5A5ZJ_Q",
        "images": [
            "nucleo_u5a5zj_q.jpg"
        ],
        "mcu": "stm32u5",
        "port": "stm32",
        "product": "Nucleo U5A5ZJ_Q",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_H723ZG",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_H723ZG",
        "images": [
            "nucleo_h723zg.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Nucleo H723ZG",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/nucleo-h723zg.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "MIKROE_CLICKER2_STM32",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "mikroBUS"
        ],
        "id": "MIKROE_CLICKER2_STM32",
        "images": [
            "mikroe_clicker2_stm32.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "MikroE Clicker 2 for STM32",
        "thumbnail": "",
        "url": "https://www.mikroe.com/clicker-2-stm32f4",
        "vendor": "MikroElektronika"
    },
    {
        "build": "NUCLEO_F412ZG",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F412ZG",
        "images": [
            "nucleo_f412zg.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Nucleo F412ZG",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_F446RE",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F446RE",
        "images": [
            "nucleo_f446re.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Nucleo F446RE",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_F756ZG",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F756ZG",
        "images": [
            "nucleo_f756zg.jpg"
        ],
        "mcu": "stm32f7",
        "port": "stm32",
        "product": "Nucleo F756ZG",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/nucleo-f756zg.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "STM32F411DISC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "STM32F411DISC",
        "images": [
            "stm32f411disc.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Discovery F411",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "STM32L496GDISC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "STM32L496GDISC",
        "images": [
            "stm32l496discovery.jpg"
        ],
        "mcu": "stm32l4",
        "port": "stm32",
        "product": "Discovery L496G",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/32l496gdiscovery.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_L452RE",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_L452RE",
        "images": [
            "nucleo_l452re.jpg"
        ],
        "mcu": "stm32l4",
        "port": "stm32",
        "product": "Nucleo L452RE",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_F439ZI",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F439ZI",
        "images": [
            "nucleo_f439zi.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Nucleo F439ZI",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "ARDUINO_GIGA",
        "deploy": [
            "./deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "External RAM",
            "USB",
            "WiFi"
        ],
        "id": "ARDUINO_GIGA",
        "images": [
            "ABX00063_01.front_1000x750.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Giga",
        "thumbnail": "",
        "url": "https://store.arduino.cc/products/giga-r1-wifi",
        "vendor": "Arduino"
    },
    {
        "build": "STM32F4DISC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "STM32F4DISC",
        "images": [
            "stm32f4disc.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Discovery F4",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "STM32H7B3I_DK",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "STM32H7B3I_DK",
        "images": [
            "stm32h7b3i_dk.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Discovery Kit H7",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_L152RE",
        "deploy": [
            "./deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_L152RE",
        "images": [
            "nucleo_l152re.jpg"
        ],
        "mcu": "stm32l1",
        "port": "stm32",
        "product": "Nucleo L152RE",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/nucleo-l152re.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "OLIMEX_H407",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "OLIMEX_H407",
        "images": [
            "olimex_h407.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "STM32-H407",
        "thumbnail": "",
        "url": "https://www.olimex.com/Products/ARM/ST/STM32-H407",
        "vendor": "Olimex"
    },
    {
        "build": "NUCLEO_G0B1RE",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_G0B1RE",
        "images": [
            "nucleo_g0b1re.jpg"
        ],
        "mcu": "stm32g0",
        "port": "stm32",
        "product": "Nucleo G0B1RE",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/nucleo-g0b1re.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "LIMIFROG",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "LIMIFROG",
        "images": [
            "limifrog.jpg"
        ],
        "mcu": "stm32l4",
        "port": "stm32",
        "product": "LimiFrog",
        "thumbnail": "",
        "url": "https://github.com/LimiFrog",
        "vendor": "LimiFrog"
    },
    {
        "build": "NUCLEO_H753ZI",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_H753ZI",
        "images": [
            "nucleo_h753zi.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Nucleo H753ZI",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/nucleo-h753zi.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "PYBV11",
        "deploy": [
            "../PYBV10/deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PYBV11",
        "images": [
            "PYBv1_1.jpg",
            "PYBv1_1-C.jpg",
            "PYBv1_1-E.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Pyboard v1.1",
        "thumbnail": "",
        "url": "https://store.micropython.org/product/PYBv1.1",
        "variants": {
            "DP": "Double-precision float",
            "DP_THREAD": "Double precision float + Threads",
            "NETWORK": "Wiznet 5200 Driver",
            "THREAD": "Threading"
        },
        "vendor": "George Robotics"
    },
    {
        "build": "MIKROE_QUAIL",
        "deploy": [
            "../MIKROE_QUAIL/deploy.md"
        ],
        "docs": "",
        "features": [
            "mikroBUS"
        ],
        "id": "MIKROE_QUAIL",
        "images": [
            "quail_top.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "MikroE Quail",
        "thumbnail": "",
        "url": "https://www.mikroe.com/quail",
        "vendor": "MikroElektronika"
    },
    {
        "build": "WEACTSTUDIO_MINI_STM32U585",
        "deploy": [
            "../PYBV10/deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "WEACTSTUDIO_MINI_STM32U585",
        "images": [
            "weact_u585ci.jpg"
        ],
        "mcu": "stm32u5",
        "port": "stm32",
        "product": "Mini STM32U585",
        "thumbnail": "",
        "url": "https://github.com/WeActStudio/WeActStudio.STM32U585Cx_CoreBoard",
        "vendor": "WeAct Studio"
    },
    {
        "build": "WEACTSTUDIO_MINI_STM32H723",
        "deploy": [
            "deploy.md"
        ],
        "features": [
            "External Flash",
            "DAC",
            "Display",
            "microSD",
            "USB",
            "USB-C"
        ],
        "id": "WEACTSTUDIO_MINI_STM32H723",
        "images": [
            "weact_stm32h723.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Mini STM32H723",
        "url": "https://github.com/WeActStudio/WeActStudio.MiniSTM32H723",
        "vendor": "WeAct Studio"
    },
    {
        "build": "NUCLEO_L4A6ZG",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_L4A6ZG",
        "images": [
            "nucleo_l4a6zg.jpg"
        ],
        "mcu": "stm32l4",
        "port": "stm32",
        "product": "Nucleo L4A6ZG",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/nucleo-l4a6zg.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "SPARKFUN_MICROMOD_STM32",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "SPARKFUN_MICROMOD_STM32",
        "images": [
            "sparkfun_micromod_stm32.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "MicroMod STM32",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/products/17713",
        "vendor": "SparkFun"
    },
    {
        "build": "PYBD_SF2",
        "deploy": [
            "deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PYBD_SF2",
        "images": [
            "PYBD_SF2_W4F2.jpg",
            "PYBD_SF2_W4F2_top.jpg",
            "PYBD_SF2_W4F2_bot.jpg",
            "PYBD_SF2_W4F2_ds1.jpg",
            "PYBD_SF2_W4F2_ds2.jpg",
            "PYBD_SF2_W4F2_ds3.jpg"
        ],
        "mcu": "stm32f7",
        "port": "stm32",
        "product": "Pyboard D-series SF2",
        "thumbnail": "",
        "url": "https://store.micropython.org/product/PYBD-SF2-W4F2",
        "vendor": "George Robotics"
    },
    {
        "build": "OLIMEX_E407",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "OLIMEX_E407",
        "images": [
            "olimex_e407.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "STM32-E407",
        "thumbnail": "",
        "url": "https://www.olimex.com/Products/ARM/ST/STM32-E407",
        "vendor": "Olimex"
    },
    {
        "build": "VCC_GND_F407ZG",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "VCC_GND_F407ZG",
        "images": [
            "STM32F407ZGT6.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "F407ZG",
        "thumbnail": "",
        "url": "http://vcc-gnd.com/",
        "vendor": "VCC-GND Studio"
    },
    {
        "build": "STM32F469DISC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "STM32F469DISC",
        "images": [
            "stm32f469disc.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Discovery F469",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/32f469idiscovery.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "PYBV10",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PYBV10",
        "images": [
            "PYBv1_0-C.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Pyboard v1.0",
        "thumbnail": "",
        "url": "",
        "variants": {
            "DP": "Double-precision float",
            "DP_THREAD": "Double precision float + Threads",
            "NETWORK": "Wiznet 5200 Driver",
            "THREAD": "Threading"
        },
        "vendor": "George Robotics"
    },
    {
        "build": "USBDONGLE_WB55",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "USBDONGLE_WB55",
        "images": [
            "usbdongle_wb55.jpg"
        ],
        "mcu": "stm32wb",
        "port": "stm32",
        "product": "USBDONGLE_WB55",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_F746ZG",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F746ZG",
        "images": [
            "nucleo_f746zg.jpg"
        ],
        "mcu": "stm32f7",
        "port": "stm32",
        "product": "Nucleo F746ZG",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "PYBD_SF3",
        "deploy": [
            "../PYBD_SF2/deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "PYBD_SF3",
        "images": [
            "PYBD_SF3_W4F2.jpg",
            "PYBD_SF3_W4F2_top.jpg",
            "PYBD_SF2_W4F2_bot.jpg",
            "PYBD_SF3_W4F2_ds1.jpg",
            "PYBD_SF3_W4F2_ds2.jpg",
            "PYBD_SF3_W4F2_ds3.jpg"
        ],
        "mcu": "stm32f7",
        "port": "stm32",
        "product": "Pyboard D-series SF3",
        "thumbnail": "",
        "url": "https://store.micropython.org/product/PYBD-SF3-W4F2",
        "vendor": "George Robotics"
    },
    {
        "build": "NETDUINO_PLUS_2",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NETDUINO_PLUS_2",
        "images": [
            "netduino_plus_2.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Netduino Plus 2",
        "thumbnail": "",
        "url": "",
        "vendor": "Netduino"
    },
    {
        "build": "NUCLEO_H563ZI",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_H563ZI",
        "images": [
            "nucleo_h563zi.jpg"
        ],
        "mcu": "stm32h5",
        "port": "stm32",
        "product": "Nucleo H563ZI",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "STM32F769DISC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "STM32F769DISC",
        "images": [
            "stm32f769disc.jpg"
        ],
        "mcu": "stm32f7",
        "port": "stm32",
        "product": "Discovery F769",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_F401RE",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F401RE",
        "images": [
            "nucleo_f401re.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Nucleo F401RE",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_F091RC",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F091RC",
        "images": [
            "nucleo_f091rc.jpg"
        ],
        "mcu": "stm32f0",
        "port": "stm32",
        "product": "Nucleo F091RC",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "ARDUINO_NICLA_VISION",
        "deploy": [
            "./deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "Secure Element",
            "USB",
            "WiFi"
        ],
        "id": "ARDUINO_NICLA_VISION",
        "images": [
            "ABX00051_01.iso_1000x750.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Nicla Vision",
        "thumbnail": "",
        "url": "https://store.arduino.cc/products/nicla-vision",
        "vendor": "Arduino"
    },
    {
        "build": "ADAFRUIT_F405_EXPRESS",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "ADAFRUIT_F405_EXPRESS",
        "images": [
            "4382-09.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "F405 Express",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/4382",
        "vendor": "Adafruit"
    },
    {
        "build": "NUCLEO_F767ZI",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F767ZI",
        "images": [
            "nucleo_f767zi.jpg"
        ],
        "mcu": "stm32f7",
        "port": "stm32",
        "product": "Nucleo F767ZI",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_H7A3ZI_Q",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_H7A3ZI_Q",
        "images": [
            "nucleo_h7a3zi_q.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Nucleo H7A3ZI-Q",
        "thumbnail": "",
        "url": "https://www.st.com/ja/evaluation-tools/nucleo-h7a3zi-q.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_G474RE",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_G474RE",
        "images": [
            "nucleo_g474re.jpg"
        ],
        "mcu": "stm32g4",
        "port": "stm32",
        "product": "Nucleo G474RE",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/nucleo-g474re.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "B_L072Z_LRWAN1",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "B_L072Z_LRWAN1",
        "images": [
            "b_l072z_lrwan1.jpg"
        ],
        "mcu": "stm32l0",
        "port": "stm32",
        "product": "B_L072Z_LRWAN1",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "STM32H747I_DISCO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "DAC",
            "Dual-core",
            "Ethernet",
            "External Flash",
            "External RAM",
            "microSD",
            "USB"
        ],
        "id": "STM32H747I_DISCO",
        "images": [
            "stm32h747i_disco.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Discovery Kit H747I",
        "thumbnail": "",
        "url": "https://www.st.com/en/evaluation-tools/stm32h747i-disco.html",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_H743ZI",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_H743ZI",
        "images": [
            "nucleo_h743zi.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Nucleo H743ZI",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "STM32F439",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "STM32F439",
        "images": [
            "stm32f439.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "STM32F439",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_F411RE",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_F411RE",
        "images": [
            "nucleo_f411re.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "Nucleo F411RE",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "NUCLEO_WB55",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "NUCLEO_WB55",
        "images": [
            "nucleo_wb55.jpg"
        ],
        "mcu": "stm32wb",
        "port": "stm32",
        "product": "Nucleo WB55",
        "thumbnail": "",
        "url": "",
        "vendor": "ST Microelectronics"
    },
    {
        "build": "GARATRONIC_PYBSTICK26_F411",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "GARATRONIC_PYBSTICK26_F411",
        "images": [
            "pybstick26_f411.jpg"
        ],
        "mcu": "stm32f4",
        "port": "stm32",
        "product": "GARATRONIC_PYBSTICK26_F411",
        "thumbnail": "",
        "url": "https://shop.mchobby.be/product.php?id_product=1844",
        "vendor": "McHobby"
    },
    {
        "build": "WEACTSTUDIO_MINI_STM32H743",
        "deploy": [
            "deploy.md"
        ],
        "features": [
            "External Flash",
            "DAC",
            "Display",
            "microSD",
            "USB",
            "USB-C"
        ],
        "id": "WEACTSTUDIO_MINI_STM32H743",
        "images": [
            "weact_stm32h743.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "Mini STM32H743",
        "url": "https://github.com/WeActStudio/MiniSTM32H7xx",
        "vendor": "WeAct Studio"
    },
    {
        "build": "VCC_GND_H743VI",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [],
        "id": "VCC_GND_H743VI",
        "images": [
            "STM32H743VIT6.jpg"
        ],
        "mcu": "stm32h7",
        "port": "stm32",
        "product": "H743VI",
        "thumbnail": "",
        "url": "http://vcc-gnd.com/",
        "vendor": "VCC-GND Studio"
    },
    {
        "build": "ADAFRUIT_FEATHER_M0_EXPRESS",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Battery Charging",
            "External Flash",
            "Feather",
            "RGB LED",
            "USB"
        ],
        "id": "ADAFRUIT_FEATHER_M0_EXPRESS",
        "images": [
            "feather_m0_express.jpg"
        ],
        "mcu": "samd21",
        "port": "samd",
        "product": "Feather M0 Express",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/3403",
        "vendor": "Adafruit"
    },
    {
        "build": "SEEED_XIAO_SAMD21",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "USB-C"
        ],
        "id": "SEEED_XIAO_SAMD21",
        "images": [
            "seeeduino-xiao.jpg"
        ],
        "mcu": "samd21",
        "port": "samd",
        "product": "XIAO SAMD21",
        "thumbnail": "",
        "url": "https://www.seeedstudio.com/Seeeduino-XIAO-Arduino-Microcontroller-SAMD21-Cortex-M0+-p-4426.html",
        "vendor": "Seeed Studio"
    },
    {
        "build": "ADAFRUIT_TRINKET_M0",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "RGB LED",
            "USB"
        ],
        "id": "ADAFRUIT_TRINKET_M0",
        "images": [
            "trinket_m0.jpg"
        ],
        "mcu": "samd21",
        "port": "samd",
        "product": "Trinket M0",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/3500",
        "vendor": "Adafruit"
    },
    {
        "build": "SAMD_GENERIC_D51X19",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "USB"
        ],
        "id": "SAMD_GENERIC_D51X19",
        "images": [
            "generic_board.jpg"
        ],
        "mcu": "samd51",
        "port": "samd",
        "product": "Generic SAMD51P19",
        "thumbnail": "",
        "url": "https://www.microchip.com/en-us/products/microcontrollers-and-microprocessors/32-bit-mcus/sam-32-bit-mcus/sam-d",
        "vendor": "Microchip"
    },
    {
        "build": "SPARKFUN_REDBOARD_TURBO",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Battery Charging",
            "DAC",
            "External Flash",
            "USB",
            "RGB LED"
        ],
        "id": "SPARKFUN_REDBOARD_TURBO",
        "images": [
            "sparkfun_readboard_turbo.jpg"
        ],
        "mcu": "samd21",
        "port": "samd",
        "product": "SparkFun RedBoard Turbo",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/products/14812",
        "vendor": "SparkFun"
    },
    {
        "build": "ADAFRUIT_ITSYBITSY_M0_EXPRESS",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "External Flash",
            "RGB LED",
            "USB"
        ],
        "id": "ADAFRUIT_ITSYBITSY_M0_EXPRESS",
        "images": [
            "itsybitsy_m0_express.jpg"
        ],
        "mcu": "samd21",
        "port": "samd",
        "product": "ItsyBitsy M0 Express",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/3727",
        "vendor": "Adafruit"
    },
    {
        "build": "ADAFRUIT_FEATHER_M4_EXPRESS",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Battery Charging",
            "External Flash",
            "Feather",
            "RGB LED",
            "USB"
        ],
        "id": "ADAFRUIT_FEATHER_M4_EXPRESS",
        "images": [
            "feather_m4_express.jpg"
        ],
        "mcu": "samd51",
        "port": "samd",
        "product": "Feather M4 Express",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/3857",
        "vendor": "Adafruit"
    },
    {
        "build": "SAMD21_XPLAINED_PRO",
        "deploy": [
            "deploy_xplained_pro.md"
        ],
        "docs": "",
        "features": [
            "External Flash",
            "USB"
        ],
        "id": "SAMD21_XPLAINED_PRO",
        "images": [
            "2033-atsamd21-xpro.jpg"
        ],
        "mcu": "samd21",
        "port": "samd",
        "product": "SAMD21 Xplained Pro",
        "thumbnail": "",
        "url": "https://www.microchip.com/en-us/development-tool/atsamd21-xpro",
        "vendor": "Microchip"
    },
    {
        "build": "SPARKFUN_SAMD21_DEV_BREAKOUT",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Battery Charging",
            "DAC",
            "USB"
        ],
        "id": "SPARKFUN_SAMD21_DEV_BREAKOUT",
        "images": [
            "sparkfun_sam21_dev_breakout.jpg"
        ],
        "mcu": "samd21",
        "port": "samd",
        "product": "SparkFun SAMD21 Dev Breakout",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/products/13672",
        "vendor": "SparkFun"
    },
    {
        "build": "SPARKFUN_SAMD51_THING_PLUS",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "Battery Charging",
            "External Flash",
            "JST-SH",
            "USB"
        ],
        "id": "SPARKFUN_SAMD51_THING_PLUS",
        "images": [
            "sparkfun_samd51_thing_plus.jpg"
        ],
        "mcu": "samd51",
        "port": "samd",
        "product": "SAMD51 Thing Plus",
        "thumbnail": "",
        "url": "https://www.sparkfun.com/products/14713",
        "vendor": "SparkFun"
    },
    {
        "build": "SAMD_GENERIC_D51X20",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "USB"
        ],
        "id": "SAMD_GENERIC_D51X20",
        "images": [
            "generic_board.jpg"
        ],
        "mcu": "samd51",
        "port": "samd",
        "product": "Generic SAMD51P20",
        "thumbnail": "",
        "url": "https://www.microchip.com/en-us/products/microcontrollers-and-microprocessors/32-bit-mcus/sam-32-bit-mcus/sam-d",
        "vendor": "Microchip"
    },
    {
        "build": "ADAFRUIT_METRO_M4_EXPRESS",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "DAC",
            "External Flash",
            "RGB LED",
            "USB",
            "WiFi"
        ],
        "id": "ADAFRUIT_METRO_M4_EXPRESS",
        "images": [
            "metro_m4_express_airlift.jpg"
        ],
        "mcu": "samd51",
        "port": "samd",
        "product": "Metro M4 Express Airlift",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/4000",
        "vendor": "Adafruit"
    },
    {
        "build": "SAMD_GENERIC_D21X18",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "USB"
        ],
        "id": "SAMD_GENERIC_D21X18",
        "images": [
            "generic_board.jpg"
        ],
        "mcu": "samd21",
        "port": "samd",
        "product": "Generic SAMD21J18",
        "thumbnail": "",
        "url": "https://www.microchip.com/en-us/products/microcontrollers-and-microprocessors/32-bit-mcus/sam-32-bit-mcus/sam-d",
        "vendor": "Microchip"
    },
    {
        "build": "ADAFRUIT_NEOKEY_TRINKEY",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "RGB LED",
            "USB"
        ],
        "id": "ADAFRUIT_NEOKEY_TRINKEY",
        "images": [
            "neokey_trinkey.jpg"
        ],
        "mcu": "samd21",
        "port": "samd",
        "product": "NeoKey Trinkey",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/5020",
        "vendor": "Adafruit"
    },
    {
        "build": "MINISAM_M4",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "External Flash",
            "RGB LED",
            "USB"
        ],
        "id": "MINISAM_M4",
        "images": [
            "mini_sam_m4.jpg"
        ],
        "mcu": "samd51",
        "port": "samd",
        "product": "Mini SAM M4",
        "thumbnail": "",
        "url": "https://minifigboards.com/products/mini-sam-m4",
        "vendor": "MiniFig Boards"
    },
    {
        "build": "ADAFRUIT_ITSYBITSY_M4_EXPRESS",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "External Flash",
            "RGB LED",
            "USB"
        ],
        "id": "ADAFRUIT_ITSYBITSY_M4_EXPRESS",
        "images": [
            "itsybitsy_m4_express.jpg"
        ],
        "mcu": "samd51",
        "port": "samd",
        "product": "ItsyBitsy M4 Express",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/3800",
        "vendor": "Adafruit"
    },
    {
        "build": "SEEED_WIO_TERMINAL",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Display",
            "External Flash",
            "JST-PH",
            "SDCard",
            "USB-C",
            "WiFi"
        ],
        "id": "SEEED_WIO_TERMINAL",
        "images": [
            "wio-terminal.jpg"
        ],
        "mcu": "samd51",
        "port": "samd",
        "product": "Wio Terminal D51R",
        "thumbnail": "",
        "url": "https://www.seeedstudio.com/Wio-Terminal-p-4509.html",
        "vendor": "Seeed Studio"
    },
    {
        "build": "ADAFRUIT_QTPY_SAMD21",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "USB-C"
        ],
        "id": "ADAFRUIT_QTPY_SAMD21",
        "images": [
            "qt_py_samd21.jpg"
        ],
        "mcu": "samd21",
        "port": "samd",
        "product": "QT Py - SAMD21",
        "thumbnail": "",
        "url": "https://www.adafruit.com/product/4600",
        "variants": {
            "SPIFLASH": "Support for an external Flash chip"
        },
        "vendor": "Adafruit"
    },
    {
        "build": "ALIF_ENSEMBLE",
        "deploy": [
            "./deploy.md"
        ],
        "docs": "",
        "features": [
            "Ethernet"
        ],
        "id": "ALIF_ENSEMBLE",
        "images": [
            "ensemble-devkit-gen-2.jpg"
        ],
        "mcu": "AE722F80F55D5XX",
        "port": "alif",
        "product": "Ensemble E7 DevKit",
        "thumbnail": "",
        "url": "https://alifsemi.com/support/kits/ensemble-devkit/",
        "vendor": "Alif Semiconductor"
    },
    {
        "build": "KIT_PSE84_AI",
        "deploy": [
            "../deploy.md"
        ],
        "docs": "",
        "features": [
            "BLE",
            "Dual-core",
            "External Flash",
            "WiFi",
            "Microphone",
            "IMU",
            "RGB LED",
            "USB-C"
        ],
        "id": "KIT_PSE84_AI",
        "images": [
            "kit_pse84_ai.jpg"
        ],
        "mcu": "PSE846GPS2DBZC4",
        "port": "psoc-edge",
        "product": "KIT_PSE84_AI",
        "thumbnail": "",
        "url": "https://www.infineon.com/evaluation-board/kit-pse84-ai",
        "vendor": "Infineon Technologies"
    }
];