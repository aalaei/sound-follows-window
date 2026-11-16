// SPDX-License-Identifier: GPL-2.0-or-later
// Keeps track of normal windows and reports their state (spec section 5).

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

/** A drag never lasts this long; if grab-op-end is missed, stop waiting for it. */
const MAX_GRAB_MS = 3000;

/**
 * @param {Meta.Window} win
 * @returns {string | null} Shell app id without ".desktop"
 */
function appIdOf(win) {
    const app = Shell.WindowTracker.get_default().get_window_app(win);
    return app ? app.get_id().replace(/\.desktop$/, '') : null;
}

export class WindowTracker {
    /**
     * @param {(msg: string) => void} log
     */
    constructor(log) {
        this._log = log;
        this._windows = new Map(); // Meta.Window -> {lastFocus, signals}
        this._connections = [];    // [object, signalId] on global.display
        this._counter = 0;
        this._grabbing = false;
        this._grabTimer = 0;
        this._onChange = null;
    }

    /**
     * @param {() => void} onChange called whenever something relevant changes
     */
    enable(onChange) {
        this._onChange = onChange;
        const display = global.display;

        for (const actor of global.get_window_actors())
            this._track(actor.meta_window);

        this._connect(display, 'window-created', (_d, win) => this._track(win));
        this._connect(display, 'window-entered-monitor', () => onChange('window-monitor'));
        this._connect(display, 'window-left-monitor', () => onChange('window-monitor'));
        this._connect(display, 'notify::focus-window', () => {
            const entry = display.focus_window && this._windows.get(display.focus_window);
            if (entry)
                entry.lastFocus = ++this._counter;
            onChange('focus');
        });
        this._connect(display, 'grab-op-begin', () => {
            this._grabbing = true;
            // Safety net: a missed grab-op-end must not stop routing for good.
            if (this._grabTimer)
                GLib.source_remove(this._grabTimer);
            this._grabTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MAX_GRAB_MS, () => {
                this._grabTimer = 0;
                this._grabbing = false;
                this._log('drag flag cleared by timeout (grab-op-end was not seen)');
                onChange('drag-timeout');
                return GLib.SOURCE_REMOVE;
            });
        });
        this._connect(display, 'grab-op-end', () => {
            this._grabbing = false;
            if (this._grabTimer) {
                GLib.source_remove(this._grabTimer);
                this._grabTimer = 0;
            }
            onChange('drag-end');
        });
    }

    /** True while the user is dragging or resizing a window. */
    isGrabbing() {
        return this._grabbing;
    }

    _connect(object, signal, callback) {
        this._connections.push([object, object.connect(signal, callback)]);
    }

    _track(win) {
        if (!win || this._windows.has(win))
            return;
        if (win.get_window_type() !== Meta.WindowType.NORMAL)
            return;

        const unmanagedId = win.connect('unmanaged', () => this._untrack(win));
        this._windows.set(win, {lastFocus: 0, unmanagedId});
    }

    _untrack(win) {
        const entry = this._windows.get(win);
        if (!entry)
            return;
        win.disconnect(entry.unmanagedId);
        this._windows.delete(win);
        this._onChange?.('window-closed');
    }

    /**
     * Snapshot of all tracked windows, in the shape lib/matcher.js expects.
     * @param {(index: number) => string | null} monitorIdAt
     * @returns {object[]}
     */
    describe(monitorIdAt) {
        return [...this._windows].map(([win, entry]) => ({
            id: win.get_id(),
            pid: win.get_pid(),
            appId: appIdOf(win),
            sandboxAppId: win.get_sandboxed_app_id?.() ?? null,
            wmClass: win.get_wm_class(),
            wmInstance: win.get_wm_class_instance(),
            gtkAppId: win.get_gtk_application_id?.() ?? null,
            monitorId: monitorIdAt(win.get_monitor()),
            lastFocus: entry.lastFocus,
        }));
    }

    disable() {
        if (this._grabTimer) {
            GLib.source_remove(this._grabTimer);
            this._grabTimer = 0;
        }
        for (const [object, id] of this._connections)
            object.disconnect(id);
        this._connections = [];

        for (const [win, entry] of this._windows)
            win.disconnect(entry.unmanagedId);
        this._windows.clear();
        this._onChange = null;
    }
}
