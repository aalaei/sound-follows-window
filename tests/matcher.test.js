// SPDX-License-Identifier: GPL-2.0-or-later
// Window <-> stream matching. Synthetic fixtures are marked as such; the
// paplay stream is recorded from a real `pactl -f json list sink-inputs`.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {normalizeName, matchWindows} from '../lib/matcher.js';
import {parseSinkInputs, parseSinks} from '../lib/pactl.js';
import {parsePpid} from '../lib/procstat.js';

const win = (overrides) => ({
    id: 1, pid: 1000, appId: null, sandboxAppId: null, wmClass: '',
    wmInstance: '', gtkAppId: null, monitorId: 'M1', lastFocus: 0,
    ...overrides,
});

const stream = (index, props) => ({index, sinkName: 'sink-a', props});

test('normalizeName strips .desktop and reverse-DNS prefixes', () => {
    assert.equal(normalizeName('org.mozilla.firefox.desktop'), 'firefox');
    assert.equal(normalizeName('Firefox'), 'firefox');
    assert.equal(normalizeName('google-chrome'), 'google-chrome');
    assert.equal(normalizeName(''), '');
    assert.equal(normalizeName(undefined), '');
});

test('real paplay stream matches its window by PID (rule 3)', () => {
    const sinks = parseSinks(readFileSync(new URL('./fixtures/sinks.json', import.meta.url), 'utf8'));
    const [s] = parseSinkInputs(readFileSync(new URL('./fixtures/paplay-sink-input.json', import.meta.url), 'utf8'), sinks);
    const windows = [
        win({id: 10, pid: 999999, wmClass: 'other'}),
        win({id: 11, pid: 216519, wmClass: 'terminal'}),
    ];
    const match = matchWindows(s, windows);
    assert.equal(match.rule, 3);
    assert.deepEqual(match.windows.map(w => w.id), [11]);
});

test('Flatpak app matches by portal app id (rule 2), even with a different PID', () => {
    // Synthetic: a Spotify-style Flatpak stream.
    const s = stream(1, {
        'pipewire.access.portal.app_id': 'com.spotify.Client',
        'application.process.id': '5555',
        'application.name': 'spotify',
    });
    const windows = [
        win({id: 20, pid: 4444, appId: 'com.spotify.Client', sandboxAppId: 'com.spotify.Client'}),
    ];
    const match = matchWindows(s, windows);
    assert.equal(match.rule, 2);
    assert.equal(match.windows[0].id, 20);
});

test('Chromium audio service matches its browser window by PID ancestry (rule 4)', () => {
    // Synthetic: Chromium (pid 3000) -> renderer -> audio service (pid 3050).
    const s = stream(2, {'application.process.id': '3050', 'application.process.binary': 'chromium'});
    const windows = [win({id: 30, pid: 3000, wmClass: 'chromium-browser', appId: 'chromium'})];
    const ancestors = new Map([[3050, new Set([3040, 3000])]]);
    const match = matchWindows(s, windows, {ancestors});
    assert.equal(match.rule, 4);
    assert.equal(match.windows[0].id, 30);
});

test('mpv matches by name when the PID does not match (rule 5)', () => {
    // Synthetic: mpv stream with a different PID, wm_class "mpv".
    const s = stream(3, {'application.process.binary': 'mpv', 'application.process.id': '7777'});
    const windows = [win({id: 40, pid: 6000, wmClass: 'mpv', wmInstance: 'mpv'})];
    const match = matchWindows(s, windows, {ancestors: new Map()});
    assert.equal(match.rule, 5);
});

test('an exact PID beats a name match on another window (rule order)', () => {
    const s = stream(4, {'application.process.id': '100', 'application.process.binary': 'firefox'});
    const windows = [
        win({id: 50, pid: 999, wmClass: 'firefox'}),
        win({id: 51, pid: 100, wmClass: 'other'}),
    ];
    const match = matchWindows(s, windows, {ancestors: new Map()});
    assert.equal(match.rule, 3);
    assert.equal(match.windows[0].id, 51);
});

test('Electron app matches its window by name (rule 5)', () => {
    // Synthetic: Electron audio stream named after the app.
    const s = stream(5, {'application.name': 'Signal', 'application.process.binary': 'signal-desktop', 'application.process.id': '8000'});
    const windows = [win({id: 60, pid: 8100, wmClass: 'signal', gtkAppId: 'org.signal.Signal'})];
    const match = matchWindows(s, windows, {ancestors: new Map()});
    assert.equal(match.rule, 5);
});

test('a windowless stream matches nothing', () => {
    const s = stream(6, {'application.process.id': '424242', 'application.name': 'pulseaudio'});
    assert.equal(matchWindows(s, [win({pid: 1, wmClass: 'firefox'})], {ancestors: new Map()}), null);
});

test('parsePpid handles command names with spaces and parentheses', () => {
    assert.equal(parsePpid('1234 (my (weird) app) S 999 1234 1234 0 -1'), 999);
    assert.equal(parsePpid('5 (bash) S 1 5 5 0 -1'), 1);
    assert.equal(parsePpid('garbage'), null);
});
