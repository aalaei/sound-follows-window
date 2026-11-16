// SPDX-License-Identifier: GPL-2.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {buildToneWav} from '../lib/tone.js';

test('buildToneWav writes a valid mono 16-bit WAV of the requested length', () => {
    const bytes = buildToneWav({durationMs: 400, sampleRate: 22050});
    const view = new DataView(bytes.buffer);
    const text = (o, n) => String.fromCharCode(...bytes.slice(o, o + n));

    assert.equal(text(0, 4), 'RIFF');
    assert.equal(text(8, 4), 'WAVE');
    assert.equal(text(36, 4), 'data');
    assert.equal(view.getUint16(22, true), 1, 'mono');
    assert.equal(view.getUint32(24, true), 22050, 'sample rate');
    assert.equal(view.getUint16(34, true), 16, 'bits per sample');
    assert.equal(view.getUint32(40, true), Math.round(22050 * 0.4) * 2, 'data size');
    assert.equal(bytes.length, 44 + Math.round(22050 * 0.4) * 2);
});

test('buildToneWav contains audible samples that fade out at the end', () => {
    const bytes = buildToneWav({});
    const view = new DataView(bytes.buffer);
    const frames = (bytes.length - 44) / 2;
    const peak = (from, to) => {
        let max = 0;
        for (let i = from; i < to; i++)
            max = Math.max(max, Math.abs(view.getInt16(44 + i * 2, true)));
        return max;
    };
    assert.ok(peak(0, frames) > 10000, 'tone is audible');
    assert.equal(view.getInt16(44 + (frames - 1) * 2, true), 0, 'ends at silence');
});
