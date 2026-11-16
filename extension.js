// SPDX-License-Identifier: GPL-2.0-or-later
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {AudioBackend} from './lib/audio.js';
import {Layout} from './lib/layout.js';
import {Router} from './lib/router.js';
import {WindowTracker} from './lib/windowTracker.js';

/**
 * Moves each app's audio to the speaker of the monitor its window is on.
 * Phase 1: follow-focus policy, no pins, no Quick Settings menu yet.
 */
export default class SoundFollowsWindowExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._log = msg => {
            if (this._settings.get_boolean('debug-logging'))
                console.debug(`sound-follows-window: ${msg}`);
        };

        this._audio = new AudioBackend(this._log);
        this._layout = new Layout(this._log);
        this._tracker = new WindowTracker(this._log);
        this._router = new Router({
            audio: this._audio,
            tracker: this._tracker,
            layout: this._layout,
            getMapping: () => this._settings.get_value('monitor-sinks').deepUnpack(),
            log: this._log,
        });

        const schedule = reason => this._router.schedule(reason);

        this._tracker.enable(schedule);
        this._layout.enable(() => schedule('monitors-changed'));
        this._audio.subscribe(() => schedule('audio'));
        this._settingsId = this._settings.connect('changed::monitor-sinks',
            () => schedule('settings'));
        schedule('enable');
    }

    disable() {
        if (this._settings) {
            this._settings.disconnect(this._settingsId);
            this._settings = null;
        }
        this._router?.destroy();
        this._audio?.destroy();
        this._tracker?.disable();
        this._layout?.disable();
        this._router = null;
        this._audio = null;
        this._tracker = null;
        this._layout = null;
    }
}
