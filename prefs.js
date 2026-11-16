// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {buildSinkOptions, spokenName, withMapping} from './lib/monitors.js';
import {fetchLayout} from './lib/mutter.js';
import {listOutputs} from './lib/outputs.js';
import {readState} from './lib/outputIO.js';
import {speakOn} from './lib/voice.js';

/** Identify request value meaning "every connected monitor". */
const IDENTIFY_ALL = '*';

export default class SoundFollowsWindowPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(560, 640);

        const page = new Adw.PreferencesPage({
            title: 'Monitors',
            icon_name: 'video-display-symbolic',
        });

        // Monitors -----------------------------------------------------
        const monitorGroup = new Adw.PreferencesGroup({
            title: 'Monitor → speaker',
            description: 'Choose which speaker plays audio for apps on each monitor. '
                + 'Use Identify to see which screen is which.',
        });
        const identifyAll = new Gtk.Button({
            label: 'Identify all',
            tooltip_text: 'Show each monitor\'s name on its screen',
            valign: Gtk.Align.CENTER,
        });
        const refresh = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            tooltip_text: 'Refresh monitors and speakers',
            valign: Gtk.Align.CENTER,
        });
        const headerBox = new Gtk.Box({spacing: 6});
        headerBox.append(identifyAll);
        headerBox.append(refresh);
        monitorGroup.set_header_suffix(headerBox);
        page.add(monitorGroup);

        // Speakers -----------------------------------------------------
        const speakerGroup = new Adw.PreferencesGroup({
            title: 'Speakers',
            description: 'Press Play to hear the speaker say its name.',
        });
        page.add(speakerGroup);

        // Debug --------------------------------------------------------
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
        const requestIdentify = id => {
            settings.set_value('identify-request', new GLib.Variant('(st)', [id, Date.now()]));
        };
        const logError = e => console.error(`sound-follows-window: ${e.message}`);

        let monitorRows = [];
        let speakerRows = [];

        identifyAll.connect('clicked', () => requestIdentify(IDENTIFY_ALL));

        const load = async () => {
            for (const row of monitorRows)
                monitorGroup.remove(row);
            for (const row of speakerRows)
                speakerGroup.remove(row);
            monitorRows = [];
            speakerRows = [];

            let monitors, outputs;
            try {
                const [layout, state] = await Promise.all([fetchLayout(), readState()]);
                monitors = layout.monitors;
                outputs = listOutputs(state.cards);
            } catch (e) {
                logError(e);
                const row = new Adw.ActionRow({
                    title: 'Could not read monitors or speakers',
                    subtitle: e.message,
                });
                monitorGroup.add(row);
                monitorRows.push(row);
                return;
            }

            if (monitors.length === 0) {
                const row = new Adw.ActionRow({
                    title: 'No monitors detected',
                    subtitle: 'Connect a monitor and press refresh.',
                });
                monitorGroup.add(row);
                monitorRows.push(row);
            }

            // buildSinkOptions works on any {name, description} list: here name is the output key.
            const choices = outputs.map(o => ({name: o.key, description: o.label}));
            const map = currentMap();
            for (const monitor of monitors) {
                const {options, selectedIndex} = buildSinkOptions(choices, map[monitor.id]);

                const model = new Gtk.StringList();
                for (const option of options)
                    model.append(option.label);

                const row = new Adw.ComboRow({
                    title: monitor.name,
                    subtitle: monitor.connector,
                    model,
                    selected: selectedIndex,
                });

                const identify = new Gtk.Button({
                    label: 'Identify',
                    tooltip_text: `Show "${monitor.name}" on this screen`,
                    valign: Gtk.Align.CENTER,
                });
                identify.connect('clicked', () => requestIdentify(monitor.id));
                row.add_suffix(identify);

                row.connect('notify::selected', () => {
                    const choice = options[row.selected];
                    if (!choice)
                        return;
                    const next = withMapping(currentMap(), monitor.id, choice.name);
                    settings.set_value('monitor-sinks', new GLib.Variant('a{ss}', next));
                });
                monitorGroup.add(row);
                monitorRows.push(row);
            }

            for (const output of outputs) {
                const row = new Adw.ActionRow({
                    title: output.label,
                    subtitle: output.port,
                });
                const play = new Gtk.Button({
                    label: 'Play',
                    tooltip_text: 'Say the name of this speaker',
                    valign: Gtk.Align.CENTER,
                });
                play.connect('clicked', () => {
                    speakOn(output.key, spokenName(output.label)).catch(logError);
                });
                row.add_suffix(play);
                speakerGroup.add(row);
                speakerRows.push(row);
            }
        };

        refresh.connect('clicked', () => {
            load().catch(logError);
        });
        load().catch(logError);
    }
}
