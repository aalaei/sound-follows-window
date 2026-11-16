// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    UNASSIGNED,
    buildSinkOptions,
    parseMonitors,
    parseSinks,
    withMapping,
} from './lib/monitors.js';

const MUTTER = {
    name: 'org.gnome.Mutter.DisplayConfig',
    path: '/org/gnome/Mutter/DisplayConfig',
    iface: 'org.gnome.Mutter.DisplayConfig',
};

/**
 * Run a command asynchronously and return its stdout.
 * @param {string[]} argv
 * @returns {Promise<string>}
 */
function run(argv) {
    return new Promise((resolve, reject) => {
        const proc = Gio.Subprocess.new(
            argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        proc.communicate_utf8_async(null, null, (p, res) => {
            try {
                const [, stdout, stderr] = p.communicate_utf8_finish(res);
                if (p.get_successful())
                    resolve(stdout);
                else
                    reject(new Error(stderr.trim() || `${argv[0]} failed`));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Read the connected monitors from Mutter (async D-Bus call).
 * @returns {Promise<ReturnType<typeof parseMonitors>>}
 */
function fetchMonitors() {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(
            MUTTER.name, MUTTER.path, MUTTER.iface, 'GetCurrentState',
            null, null, Gio.DBusCallFlags.NONE, -1, null,
            (conn, res) => {
                try {
                    const [, monitors] = conn.call_finish(res).deepUnpack();
                    resolve(parseMonitors(monitors));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

/** @returns {Promise<{name: string, description: string}[]>} */
async function fetchSinks() {
    return parseSinks(await run(['pactl', '-f', 'json', 'list', 'sinks']));
}

export default class SoundFollowsWindowPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(560, 520);

        const page = new Adw.PreferencesPage({
            title: 'Monitors',
            icon_name: 'video-display-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: 'Monitor → speaker',
            description: 'Choose which speaker should play audio for apps on each monitor.',
        });

        const refresh = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            tooltip_text: 'Refresh monitors and speakers',
            valign: Gtk.Align.CENTER,
        });
        group.set_header_suffix(refresh);
        page.add(group);
        window.add(page);

        const currentMap = () => settings.get_value('monitor-sinks').deepUnpack();

        let rows = [];
        const clearRows = () => {
            for (const row of rows)
                group.remove(row);
            rows = [];
        };
        const addRow = row => {
            group.add(row);
            rows.push(row);
        };

        const load = async () => {
            clearRows();
            let monitors, sinks;
            try {
                [monitors, sinks] = await Promise.all([fetchMonitors(), fetchSinks()]);
            } catch (e) {
                console.error(`sound-follows-window: ${e.message}`);
                addRow(new Adw.ActionRow({
                    title: 'Could not read monitors or speakers',
                    subtitle: e.message,
                }));
                return;
            }

            if (monitors.length === 0) {
                addRow(new Adw.ActionRow({
                    title: 'No monitors detected',
                    subtitle: 'Connect a monitor and press refresh.',
                }));
                return;
            }

            const map = currentMap();
            for (const monitor of monitors) {
                const stored = map[monitor.id];
                const {options, selectedIndex} = buildSinkOptions(sinks, stored);

                const model = new Gtk.StringList();
                for (const option of options)
                    model.append(option.label);

                const row = new Adw.ComboRow({
                    title: monitor.name,
                    subtitle: monitor.connector,
                    model,
                    selected: selectedIndex,
                });
                row.connect('notify::selected', () => {
                    const choice = options[row.selected];
                    if (!choice)
                        return;
                    const next = withMapping(currentMap(), monitor.id, choice.name);
                    settings.set_value('monitor-sinks', new GLib.Variant('a{ss}', next));
                });
                addRow(row);
            }
        };

        refresh.connect('clicked', () => {
            load();
        });
        load();
    }
}
