// SPDX-License-Identifier: GPL-2.0-or-later
// Reads the monitor layout from Mutter over D-Bus.

import {dbusCall} from './system.js';
import {parseLogicalMonitors, parseMonitors} from './monitors.js';

const NAME = 'org.gnome.Mutter.DisplayConfig';
const PATH = '/org/gnome/Mutter/DisplayConfig';
const IFACE = 'org.gnome.Mutter.DisplayConfig';

/**
 * @returns {Promise<{monitors: ReturnType<typeof parseMonitors>,
 *                    logical: ReturnType<typeof parseLogicalMonitors>}>}
 */
export async function fetchLayout() {
    const variant = await dbusCall(NAME, PATH, IFACE, 'GetCurrentState');
    const [, monitors, logical] = variant.deepUnpack();
    return {
        monitors: parseMonitors(monitors),
        logical: parseLogicalMonitors(logical),
    };
}
