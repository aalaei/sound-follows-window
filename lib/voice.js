// SPDX-License-Identifier: GPL-2.0-or-later
// Speaks a short phrase through one specific output, so the user can hear
// which speaker is which. Uses espeak-ng (text to WAV) and paplay (to a sink).

import GLib from 'gi://GLib';

import {run} from './system.js';

/**
 * Speak a phrase on one sink.
 * @param {string} sinkName PipeWire node name of the output
 * @param {string} text what to say
 * @returns {Promise<void>}
 */
export async function speakOn(sinkName, text) {
    const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'sound-follows-window']);
    GLib.mkdir_with_parents(dir, 0o755);

    const safe = sinkName.replace(/[^A-Za-z0-9_.-]/g, '_');
    const file = GLib.build_filenamev([dir, `voice-${safe}.wav`]);

    await run(['espeak-ng', '-w', file, text]);
    await run(['paplay', `--device=${sinkName}`, file]);
}
