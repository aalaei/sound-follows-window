// SPDX-License-Identifier: GPL-2.0-or-later
// Plays a short indication tone through one specific output, so the user can
// hear which speaker is which. Uses pw-play with --target, which reaches
// HDMI outputs that paplay --device does not.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {buildToneWav} from './tone.js';
import {ensureOutput} from './outputIO.js';
import {run} from './system.js';

/**
 * @param {string} path
 * @param {Uint8Array} bytes
 * @returns {Promise<void>}
 */
function writeFile(path, bytes) {
    return new Promise((resolve, reject) => {
        Gio.File.new_for_path(path).replace_contents_async(
            new GLib.Bytes(bytes), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null,
            (file, res) => {
                try {
                    file.replace_contents_finish(res);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
    });
}

/**
 * Play the indication tone through one output.
 * @param {string} key output key (see lib/outputs.js)
 * @returns {Promise<void>} rejects if the output is not available
 */
export async function playOn(key) {
    const sinkName = await ensureOutput(key);
    if (!sinkName)
        throw new Error('That output is not available right now. Is the monitor or speaker connected?');

    const dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'sound-follows-window']);
    GLib.mkdir_with_parents(dir, 0o755);

    const safe = key.replace(/[^A-Za-z0-9_.-]/g, '_');
    const file = GLib.build_filenamev([dir, `tone-${safe}.wav`]);

    await writeFile(file, buildToneWav());
    await run(['pw-play', `--target=${sinkName}`, file]);
}
