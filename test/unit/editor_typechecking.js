/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

import { assert } from 'chai'

import { supportsTypechecking } from '../../src/editor.js'

describe('Editor type-checking eligibility', () => {
    it('accepts only editable Python source files', () => {
        assert.isTrue(supportsTypechecking('main.py'))
        assert.isTrue(supportsTypechecking('/lib/driver.py'))
        assert.isFalse(supportsTypechecking('main.py', true))
        assert.isFalse(supportsTypechecking('firmware.mpy.dis'))
        assert.isFalse(supportsTypechecking('README.md'))
        assert.isFalse(supportsTypechecking('data.bin'))
    })
})
