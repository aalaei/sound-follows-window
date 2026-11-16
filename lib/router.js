// SPDX-License-Identifier: GPL-2.0-or-later
// Reconciles desired and actual routing (spec section 5, "reconcile loop").
// Events only schedule a run. A run is debounced, skipped while a window is
// being dragged (R2), and only acts on streams whose target output changed.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {decideTargets} from './policy.js';
import {loadAncestors} from './procfs.js';
import {ensureOutput} from './outputIO.js';

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

        this._applied = new Map(); // stream index -> output key we last routed it to
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
        const {streams} = await this._audio.snapshot();
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
            ancestors,
        });
        for (const s of skipped)
            this._log(`stream ${s.streamIndex} skipped: ${s.reason}`);

        const byIndex = new Map(streams.map(s => [s.index, s]));
        for (const decision of decisions) {
            if (this._destroyed)
                return;
            // Already routed to this output: do nothing, so a manual move is respected (R7).
            if (this._applied.get(decision.streamIndex) === decision.outputKey)
                continue;

            const stream = byIndex.get(decision.streamIndex);
            const sinkName = await ensureOutput(decision.outputKey, {
                cancellable: this._cancellable,
                log: this._log,
            });
            if (this._destroyed)
                return;
            if (!sinkName) {
                this._log(`stream ${decision.streamIndex}: output ${decision.outputKey} is not available`);
                continue;
            }

            try {
                if (stream.sinkName !== sinkName)
                    await this._audio.moveStream(decision.streamIndex, sinkName);
                this._applied.set(decision.streamIndex, decision.outputKey);
                this._log(`stream ${decision.streamIndex} -> ${sinkName} (rule ${decision.rule})`);
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
