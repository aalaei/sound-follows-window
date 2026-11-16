// SPDX-License-Identifier: GPL-2.0-or-later
// Reconciles desired and actual routing (spec section 5, "reconcile loop").
// Events only schedule a run. A run is debounced, skipped while a window is
// being dragged (R2), and only moves streams whose target changed.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {decideTargets, needsMove} from './policy.js';
import {loadAncestors} from './procfs.js';

const DEBOUNCE_MS = 300;

export class Router {
    /**
     * @param {object} deps
     * @param {import('./audio.js').AudioBackend} deps.audio
     * @param {import('./windowTracker.js').WindowTracker} deps.tracker
     * @param {import('./layout.js').Layout} deps.layout
     * @param {() => Record<string, string>} deps.getMapping
     * @param {(msg: string) => void} deps.log
     */
    constructor({audio, tracker, layout, getMapping, log}) {
        this._audio = audio;
        this._tracker = tracker;
        this._layout = layout;
        this._getMapping = getMapping;
        this._log = log;

        this._applied = new Map(); // stream index -> sink we last set
        this._timer = 0;
        this._running = false;
        this._again = false;
        this._cancellable = new Gio.Cancellable();
        this._destroyed = false;
    }

    /** @param {string} reason for the debug log */
    schedule(reason) {
        if (this._destroyed)
            return;
        this._log(`schedule: ${reason}`);
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this._timer = 0;
            this._reconcile();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _reconcile() {
        if (this._destroyed)
            return;
        if (this._running) {
            this._again = true;
            return;
        }
        if (this._tracker.isGrabbing())
            return;

        this._running = true;
        try {
            await this._run();
        } catch (e) {
            console.error(`sound-follows-window: ${e.message}`);
        } finally {
            this._running = false;
            if (this._again && !this._destroyed) {
                this._again = false;
                this.schedule('catch-up');
            }
        }
    }

    async _run() {
        const {sinks, streams} = await this._audio.snapshot();
        if (this._destroyed)
            return;

        const pids = streams
            .map(s => Number(s.props['application.process.id']))
            .filter(Number.isFinite);
        const ancestors = await loadAncestors(pids, this._cancellable);
        if (this._destroyed)
            return;

        const {decisions, skipped} = decideTargets({
            streams,
            windows: this._tracker.describe(index => this._layout.monitorIdAt(index)),
            mapping: this._getMapping(),
            sinkNames: new Set(sinks.map(s => s.name)),
            ancestors,
        });
        for (const s of skipped)
            this._log(`stream ${s.streamIndex} skipped: ${s.reason}`);

        const byIndex = new Map(streams.map(s => [s.index, s]));
        for (const decision of decisions) {
            if (this._destroyed)
                return;
            const stream = byIndex.get(decision.streamIndex);
            const applied = this._applied.get(decision.streamIndex);

            if (stream.sinkName === decision.sinkName) {
                this._applied.set(decision.streamIndex, decision.sinkName);
                continue;
            }
            if (!needsMove({desired: decision.sinkName, actual: stream.sinkName, applied}))
                continue;

            try {
                await this._audio.moveStream(decision.streamIndex, decision.sinkName);
                this._applied.set(decision.streamIndex, decision.sinkName);
                this._log(`moved stream ${decision.streamIndex} to ${decision.sinkName} (rule ${decision.rule})`);
            } catch (e) {
                this._log(`could not move stream ${decision.streamIndex}: ${e.message}`);
            }
        }

        const live = new Set(streams.map(s => s.index));
        for (const index of this._applied.keys()) {
            if (!live.has(index))
                this._applied.delete(index);
        }
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        this._applied.clear();
    }
}
