// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {buildSinkOptions, withMapping} from './lib/monitors.js';
import {fetchLayout} from './lib/mutter.js';
import {parseSinks} from './lib/pactl.js';
import {run} from './lib/system.js';

export default class SoundFollowsWindowPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(560, 560);

        const page = new Adw.PreferencesPage({
            title: 'Monitors',
            icon_name: 'video-display-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: 'Monitor → speaker',
            description: 'Choose which speaker plays audio for apps on each monitor.',
        });
        const refresh = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            tooltip_text: 'Refresh monitors and speakers',
            valign: Gtk.Align.CENTER,
        });
        group.set_header_suffix(refresh);
        page.add(group);

        const debugGroup = new Adw.PreferencesGroup({title: 'Debug'});
        const debugRow = new Adw.SwitchRow({
            title: 'Verbose logging',
            subtitle: 'Log routing decisions. Read with: journalctl -f -o cat /usr/bin/gnome-shell',
        });
        settings.bind('debug-logging', debugRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        debugGroup.add(debugRow);
        page.add(debugGroup);

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
                const [layout, sinkJson] = await Promise.all([
                    fetchLayout(),
                    run(['pactl', '-f', 'json', 'list', 'sinks']),
                ]);
                monitors = layout.monitors;
                sinks = parseSinks(sinkJson);
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
                const {options, selectedIndex} = buildSinkOptions(sinks, map[monitor.id]);

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
