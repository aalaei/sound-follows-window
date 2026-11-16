// SPDX-License-Identifier: GPL-2.0-or-later
// Policy: which sink a stream should use. Windows are synthetic.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {decideTargets, needsMove, followFocus} from '../lib/policy.js';

const MON_LAPTOP = 'eDP-1|SDC|0x41ab|0';
const MON_TV = 'HDMI-1|JMG|JMGO|1';
const MON_DP = 'DP-4|RTK|0x2555|demoset-1';
const MAPPING = {[MON_LAPTOP]: 'sink.laptop', [MON_TV]: 'sink.hdmi1', [MON_DP]: 'sink.dp'};
const SINKS = new Set(['sink.laptop', 'sink.hdmi1', 'sink.dp']);

const win = (overrides) => ({
    id: 1, pid: 1000, appId: null, sandboxAppId: null, wmClass: '',
    wmInstance: '', gtkAppId: null, monitorId: MON_LAPTOP, lastFocus: 0,
    ...overrides,
});
const stream = (index, props, sinkName = 'sink.laptop') => ({index, sinkName, props});

test('follow focus: the most recently focused window of the app wins', () => {
    const windows = [
        win({id: 1, monitorId: MON_LAPTOP, lastFocus: 5}),
        win({id: 2, monitorId: MON_TV, lastFocus: 9}),
    ];
    assert.equal(followFocus(windows).id, 2);
});

test('same app on two monitors: audio follows the focused window (follow-focus)', () => {
    const streams = [stream(10, {'application.process.id': '1000', 'application.name': 'mpv'})];
    const windows = [
        win({id: 1, pid: 1000, wmClass: 'mpv', monitorId: MON_LAPTOP, lastFocus: 3}),
        win({id: 2, pid: 1000, wmClass: 'mpv', monitorId: MON_TV, lastFocus: 7}),
    ];
    const {decisions} = decideTargets({streams, windows, mapping: MAPPING, sinkNames: SINKS});
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].sinkName, 'sink.hdmi1');
    assert.equal(decisions[0].windowId, 2);
});

test('new stream is routed to the speaker of its window monitor (R3)', () => {
    const streams = [stream(11, {'application.process.id': '2000', 'application.process.binary': 'firefox'})];
    const windows = [win({id: 3, pid: 2000, wmClass: 'firefox', monitorId: MON_DP})];
    const {decisions} = decideTargets({streams, windows, mapping: MAPPING, sinkNames: SINKS});
    assert.deepEqual(decisions, [{streamIndex: 11, sinkName: 'sink.dp', windowId: 3, rule: 3}]);
});

test('unassigned monitor: nothing is done for its windows (R1)', () => {
    const streams = [stream(12, {'application.process.id': '2000'})];
    const windows = [win({id: 4, pid: 2000, monitorId: 'unknown|x|y|z'})];
    const result = decideTargets({streams, windows, mapping: MAPPING, sinkNames: SINKS});
    assert.deepEqual(result.decisions, []);
    assert.equal(result.skipped[0].reason, 'unassigned');
});

test('saved sink that is missing is skipped, not rerouted (R6)', () => {
    const streams = [stream(13, {'application.process.id': '2000'})];
    const windows = [win({id: 5, pid: 2000, monitorId: MON_TV})];
    const result = decideTargets({
        streams, windows, mapping: MAPPING, sinkNames: new Set(['sink.laptop']),
    });
    assert.deepEqual(result.decisions, []);
    assert.equal(result.skipped[0].reason, 'sink-missing');
});

test('excluded roles and windowless system sounds are never routed (R8)', () => {
    const windows = [win({id: 6, pid: 3000, wmClass: 'gnome-shell', monitorId: MON_TV})];
    const streams = [
        stream(14, {'media.role': 'event', 'application.process.id': '3000'}),
        stream(15, {'media.role': 'notification', 'application.process.id': '3000'}),
        stream(16, {'application.process.id': '9999', 'application.name': 'pulseaudio'}),
    ];
    const result = decideTargets({streams, windows, mapping: MAPPING, sinkNames: SINKS});
    assert.deepEqual(result.decisions, []);
    assert.deepEqual(result.skipped.map(s => s.reason), ['role', 'role', 'no-window']);
});

test('window with no monitor yet is skipped', () => {
    const streams = [stream(17, {'application.process.id': '2000'})];
    const windows = [win({id: 7, pid: 2000, monitorId: null})];
    const result = decideTargets({streams, windows, mapping: MAPPING, sinkNames: SINKS});
    assert.equal(result.skipped[0].reason, 'no-monitor');
});

test('needsMove: idempotent when already on target', () => {
    assert.equal(needsMove({desired: 'a', actual: 'a', applied: undefined}), false);
});

test('needsMove: new stream on the wrong sink is moved', () => {
    assert.equal(needsMove({desired: 'a', actual: 'b', applied: undefined}), true);
});

test('needsMove: a manual move away from the target is not undone (R7)', () => {
    // We moved the stream to 'a' earlier; the user then moved it to 'c'.
    assert.equal(needsMove({desired: 'a', actual: 'c', applied: 'a'}), false);
});

test('needsMove: a changed target moves the stream again', () => {
    // The window went to a monitor that maps to 'b'.
    assert.equal(needsMove({desired: 'b', actual: 'a', applied: 'a'}), true);
});
