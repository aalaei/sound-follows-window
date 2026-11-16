// SPDX-License-Identifier: GPL-2.0-or-later
// AudioBackend: talks to PipeWire through pactl (spec section 5).
// Everything is asynchronous. A single long-running `pactl subscribe`
// reports changes, and it is restarted with backoff if it dies.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {parseSinkInputs, parseSinks, parseSubscribeLine} from './pactl.js';
import {run} from './system.js';

const MAX_BACKOFF_S = 30;

export class AudioBackend {
    /**
     * @param {(msg: string) => void} log
     */
    constructor(log) {
        this._log = log;
        this._cancellable = new Gio.Cancellable();
        this._proc = null;
        this._reader = null;
        this._onEvent = null;
        this._backoff = 1;
        this._restartTimer = 0;
        this._destroyed = false;
    }

    /** @returns {Promise<{index: number, name: string, description: string}[]>} */
    async listSinks() {
        return parseSinks(await run(['pactl', '-f', 'json', 'list', 'sinks'], this._cancellable));
    }

    /**
     * Sinks and playing streams, taken together so stream sink names are consistent.
     * @returns {Promise<{sinks: object[], streams: object[]}>}
     */
    async snapshot() {
        const sinks = await this.listSinks();
        const json = await run(['pactl', '-f', 'json', 'list', 'sink-inputs'], this._cancellable);
        return {sinks, streams: parseSinkInputs(json, sinks)};
    }

    /**
     * @param {number} streamIndex
     * @param {string} sinkName
     */
    async moveStream(streamIndex, sinkName) {
        await run(['pactl', 'move-sink-input', String(streamIndex), sinkName], this._cancellable);
    }

    /**
     * Start listening for sink and stream changes.
     * @param {(event: object) => void} onEvent called with parsed subscribe events,
     *   or with {action: 'resync'} after the listener was restarted
     */
    subscribe(onEvent) {
        this._onEvent = onEvent;
        this._start();
    }

    _start() {
        if (this._destroyed)
            return;

        try {
            this._proc = Gio.Subprocess.new(
                ['pactl', 'subscribe'], Gio.SubprocessFlags.STDOUT_PIPE);
        } catch (e) {
            this._log(`pactl subscribe failed to start: ${e.message}`);
            this._scheduleRestart();
            return;
        }

        this._reader = new Gio.DataInputStream({
            base_stream: this._proc.get_stdout_pipe(),
        });
        this._readLine();

        this._proc.wait_async(this._cancellable, () => {
            if (!this._destroyed)
                this._scheduleRestart();
        });
    }

    _readLine() {
        this._reader.read_line_async(GLib.PRIORITY_DEFAULT, this._cancellable, (stream, res) => {
            if (this._destroyed)
                return;

            let line;
            try {
                [line] = stream.read_line_finish_utf8(res);
            } catch (e) {
                this._log(`pactl subscribe read error: ${e.message}`);
                return;
            }

            if (line === null) // end of stream: pactl exited
                return;

            this._backoff = 1;
            const event = parseSubscribeLine(line);
            if (event)
                this._onEvent?.(event);
            this._readLine();
        });
    }

    _scheduleRestart() {
        if (this._restartTimer || this._destroyed)
            return;

        const delay = this._backoff;
        this._backoff = Math.min(this._backoff * 2, MAX_BACKOFF_S);
        this._restartTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
            this._restartTimer = 0;
            this._log(`restarting pactl subscribe (after ${delay}s)`);
            this._start();
            // Events may have been missed while we were down.
            this._onEvent?.({action: 'resync'});
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        if (this._restartTimer) {
            GLib.source_remove(this._restartTimer);
            this._restartTimer = 0;
        }
        if (this._proc) {
            this._proc.force_exit();
            this._proc = null;
        }
        this._reader = null;
        this._onEvent = null;
    }
}
