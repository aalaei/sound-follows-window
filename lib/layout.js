// SPDX-License-Identifier: GPL-2.0-or-later
// Maps Shell monitor indices to stable monitor ids (R5).

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {fetchLayout} from './mutter.js';

export class Layout {
    /**
     * @param {(msg: string) => void} log
     */
    constructor(log) {
        this._log = log;
        this._logical = [];
        this._signalId = 0;
        this._destroyed = false;
    }

    /** Re-read the layout from Mutter. Errors are logged, not thrown. */
    async refresh() {
        try {
            const {logical} = await fetchLayout();
            if (!this._destroyed)
                this._logical = logical;
        } catch (e) {
            this._log(`could not read monitor layout: ${e.message}`);
        }
    }

    /**
     * Stable id of the monitor at a Shell monitor index.
     * The Shell monitor and Mutter's logical monitor share the same origin,
     * which is how the two are matched.
     * @param {number} index
     * @returns {string | null}
     */
    monitorIdAt(index) {
        const monitor = Main.layoutManager.monitors[index];
        if (!monitor)
            return null;
        const logical = this._logical.find(l => l.x === monitor.x && l.y === monitor.y);
        return logical?.ids[0] ?? null;
    }

    /**
     * @param {() => void} onChanged called after the layout was re-read
     */
    enable(onChanged) {
        this._signalId = Main.layoutManager.connect('monitors-changed',
            () => this._refreshThen(onChanged));
        this._refreshThen(onChanged);
    }

    _refreshThen(callback) {
        this.refresh().then(() => {
            if (!this._destroyed)
                callback();
        });
    }

    disable() {
        this._destroyed = true;
        if (this._signalId) {
            Main.layoutManager.disconnect(this._signalId);
            this._signalId = 0;
        }
    }
}
