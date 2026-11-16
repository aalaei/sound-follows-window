// SPDX-License-Identifier: GPL-2.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
    UNASSIGNED,
    buildSinkOptions,
    monitorId,
    parseMonitors,
    parseSinks,
    withMapping,
} from '../lib/monitors.js';

const SINKS_JSON = JSON.stringify([
    {name: 'alsa_output.hdmi3', description: 'HDMI 3'},
    {name: 'alsa_output.line2', description: 'Line Out 2'},
]);

test('monitorId joins connector and EDID identity', () => {
    assert.equal(
        monitorId({connector: 'DP-4', vendor: 'RTK', product: '0x2555', serial: 'demoset-1'}),
        'DP-4|RTK|0x2555|demoset-1');
});

test('parseMonitors reads Mutter GetCurrentState monitors', () => {
    const raw = [
        [['DP-4', 'RTK', '0x2555', 'demoset-1'], [], {'display-name': 'RTK'}],
        [['eDP-1', 'SDC', '0x41ab', '0x00000000'], [], {}],
    ];
    const monitors = parseMonitors(raw);
    assert.equal(monitors[0].id, 'DP-4|RTK|0x2555|demoset-1');
    assert.equal(monitors[0].name, 'RTK');
    assert.equal(monitors[1].name, 'eDP-1', 'falls back to the connector name');
});

test('parseSinks reads pactl JSON and falls back to the name', () => {
    const sinks = parseSinks(JSON.stringify([{name: 'a'}, {name: 'b', description: 'B'}]));
    assert.deepEqual(sinks, [
        {name: 'a', description: 'a'},
        {name: 'b', description: 'B'},
    ]);
});

test('buildSinkOptions selects Unassigned when nothing is saved', () => {
    const {options, selectedIndex} = buildSinkOptions(parseSinks(SINKS_JSON), undefined);
    assert.equal(options[0].name, UNASSIGNED);
    assert.equal(selectedIndex, 0);
    assert.equal(options.length, 3);
});

test('buildSinkOptions selects the saved sink', () => {
    const {selectedIndex} = buildSinkOptions(parseSinks(SINKS_JSON), 'alsa_output.line2');
    assert.equal(selectedIndex, 2);
});

test('buildSinkOptions keeps a saved but missing sink visible (R6)', () => {
    const {options, selectedIndex} = buildSinkOptions(parseSinks(SINKS_JSON), 'gone.sink');
    assert.equal(options[selectedIndex].name, 'gone.sink');
    assert.match(options[selectedIndex].label, /not connected/);
});

test('withMapping sets, replaces and clears entries without mutating input', () => {
    const start = {'DP-4|RTK|0x2555|demoset-1': 'a'};
    const set = withMapping(start, 'eDP-1|SDC|0x41ab|0', 'b');
    assert.deepEqual(set, {'DP-4|RTK|0x2555|demoset-1': 'a', 'eDP-1|SDC|0x41ab|0': 'b'});
    assert.deepEqual(start, {'DP-4|RTK|0x2555|demoset-1': 'a'}, 'input unchanged');

    const cleared = withMapping(set, 'DP-4|RTK|0x2555|demoset-1', UNASSIGNED);
    assert.deepEqual(cleared, {'eDP-1|SDC|0x41ab|0': 'b'});
});
