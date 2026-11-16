// SPDX-License-Identifier: GPL-2.0-or-later
// Builds a short sine-tone WAV file in memory. Pure: no GNOME imports.

/**
 * A mono 16-bit PCM WAV containing one tone, with a short fade-out so it
 * does not click at the end.
 * @param {object} [options]
 * @param {number} [options.frequency=880] Hz
 * @param {number} [options.durationMs=150]
 * @param {number} [options.sampleRate=22050]
 * @returns {Uint8Array}
 */
export function buildToneWav({frequency = 880, durationMs = 150, sampleRate = 22050} = {}) {
    const frames = Math.round(sampleRate * durationMs / 1000);
    const dataBytes = frames * 2;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);

    const writeText = (offset, text) => {
        for (let i = 0; i < text.length; i++)
            view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeText(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeText(8, 'WAVE');
    writeText(12, 'fmt ');
    view.setUint32(16, 16, true);            // fmt chunk size
    view.setUint16(20, 1, true);             // PCM
    view.setUint16(22, 1, true);             // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true);             // block align
    view.setUint16(34, 16, true);            // bits per sample
    writeText(36, 'data');
    view.setUint32(40, dataBytes, true);

    const fadeFrames = Math.min(frames, Math.round(sampleRate * 0.05));
    for (let i = 0; i < frames; i++) {
        const fade = i >= frames - fadeFrames ? (frames - 1 - i) / fadeFrames : 1;
        const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * fade * 0.5;
        view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
    }

    return new Uint8Array(buffer);
}
