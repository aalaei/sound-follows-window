// SPDX-License-Identifier: GPL-2.0-or-later
// Keeps track of normal windows and reports their state (spec section 5).

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

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
        this._connect(display, 'window-entered-monitor', () => onChange());
        this._connect(display, 'window-left-monitor', () => onChange());
        this._connect(display, 'notify::focus-window', () => {
            const entry = display.focus_window && this._windows.get(display.focus_window);
            if (entry)
                entry.lastFocus = ++this._counter;
            onChange();
        });
        this._connect(display, 'grab-op-begin', () => {
            this._grabbing = true;
        });
        this._connect(display, 'grab-op-end', () => {
            this._grabbing = false;
            onChange();
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
        this._onChange?.();
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
        for (const [object, id] of this._connections)
            object.disconnect(id);
        this._connections = [];

        for (const [win, entry] of this._windows)
            win.disconnect(entry.unmanagedId);
        this._windows.clear();
        this._onChange = null;
    }
}
