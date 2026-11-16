// SPDX-License-Identifier: GPL-2.0-or-later
// Says a short phrase through one specific output, so the user can hear which
// speaker is which. espeak-ng makes the speech (WAV); pw-play plays it on the
// output using --target, which reaches HDMI outputs that paplay --device does not.

import GLib from 'gi://GLib';

import {ensureOutput} from './outputIO.js';
import {run} from './system.js';

/**
 * Say a phrase through one output.
 * @param {string} key output key (see lib/outputs.js)
 * @param {string} text what to say
 * @returns {Promise<void>} rejects if the output or espeak-ng is not available
 */
export async function speakOn(key, text) {
    if (!GLib.find_program_in_path('espeak-ng'))
        throw new Error('Spoken names need espeak-ng. Install it with your package manager (for example: sudo dnf install espeak-ng).');

    const sinkName = await ensureOutput(key);
    if (!sinkName)
        throw new Error('That output is not available right now. Is the monitor or speaker connected?');

    const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'sound-follows-window']);
    GLib.mkdir_with_parents(dir, 0o755);

    const safe = key.replace(/[^A-Za-z0-9_.-]/g, '_');
    const file = GLib.build_filenamev([dir, `voice-${safe}.wav`]);

    await run(['espeak-ng', '-w', file, text]);
    await run(['pw-play', `--target=${sinkName}`, file]);
}
