// SPDX-License-Identifier: GPL-2.0-or-later
// Shows a large label on one or more monitors for a few seconds, so the user
// can tell which screen is which in the preferences.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SHOW_SECONDS = 4;

const LABEL_STYLE = [
    'font-size: 72px',
    'font-weight: bold',
    'color: white',
    'background-color: rgba(0, 0, 0, 0.75)',
    'padding: 24px 40px',
    'border-radius: 24px',
    'text-align: center',
].join('; ');

export class Identify {
    constructor() {
        this._overlays = [];
        this._timer = 0;
    }

    /**
     * @param {{index: number, text: string}[]} items Shell monitor index and the label to show
     */
    show(items) {
        this.hide();

        for (const {index, text} of items) {
            const monitor = Main.layoutManager.monitors[index];
            if (!monitor)
                continue;

            // Centre the label in the monitor: alignment is set on the child.
            const label = new St.Label({
                text,
                style: LABEL_STYLE,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const overlay = new St.Widget({
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: monitor.height,
                reactive: false,
                layout_manager: new Clutter.BinLayout(),
            });
            overlay.add_child(label);
            Main.uiGroup.add_child(overlay);
            this._overlays.push(overlay);
        }

        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, SHOW_SECONDS, () => {
            this._timer = 0;
            this.hide();
            return GLib.SOURCE_REMOVE;
        });
    }

    hide() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        for (const overlay of this._overlays)
            overlay.destroy();
        this._overlays = [];
    }
}
