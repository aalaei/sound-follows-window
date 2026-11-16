// SPDX-License-Identifier: GPL-2.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
    UNASSIGNED,
    buildSinkOptions,
    monitorId,
    parseLogicalMonitors,
    parseMonitors,
    spokenName,
    withMapping,
} from '../lib/monitors.js';
import {parseSinks} from '../lib/pactl.js';

const SINKS_JSON = JSON.stringify([
    {index: 1, name: 'alsa_output.hdmi3', description: 'HDMI 3'},
    {index: 2, name: 'alsa_output.line2', description: 'Line Out 2'},
]);

test('monitorId joins connector and EDID identity', () => {
    assert.equal(
        monitorId({connector: 'DP-4', vendor: 'RTK', product: '0x2555', serial: 'demoset-1'}),
        'DP-4|RTK|0x2555|demoset-1');
});

test('parseMonitors reads Mutter monitors', () => {
    const raw = [
        [['DP-4', 'RTK', '0x2555', 'demoset-1'], [], {'display-name': 'RTK'}],
        [['eDP-1', 'SDC', '0x41ab', '0x00000000'], [], {}],
    ];
    const monitors = parseMonitors(raw);
    assert.equal(monitors[0].id, 'DP-4|RTK|0x2555|demoset-1');
    assert.equal(monitors[0].name, 'RTK');
    assert.equal(monitors[1].name, 'eDP-1', 'falls back to the connector name');
});

test('parseMonitors unwraps GVariant-like display names (RTK case)', () => {
    const raw = [
        [['DP-4', 'RTK', '0x2555', 'demoset-1'], [], {'display-name': {deepUnpack: () => 'RTK'}}],
        [['HDMI-1', 'JMG', 'JMGO', '0x00000001'], [], {'display-name': {deepUnpack: () => 'JMG 52"'}}],
    ];
    const names = parseMonitors(raw).map(m => m.name);
    assert.deepEqual(names, ['RTK', 'JMG 52"']);
});

test('parseLogicalMonitors gives each layout rectangle its monitor ids', () => {
    const raw = [
        [0, 0, 1, 0, true, [['eDP-1', 'SDC', '0x41ab', '0']], {}],
        [1920, 0, 1, 0, false, [['DP-4', 'RTK', '0x2555', 'demoset-1']], {}],
    ];
    assert.deepEqual(parseLogicalMonitors(raw), [
        {x: 0, y: 0, ids: ['eDP-1|SDC|0x41ab|0']},
        {x: 1920, y: 0, ids: ['DP-4|RTK|0x2555|demoset-1']},
    ]);
});

test('parseSinks reads real pactl JSON and falls back to the name', () => {
    const sinks = parseSinks(JSON.stringify([{index: 7, name: 'a'}, {index: 8, name: 'b', description: 'B'}]));
    assert.deepEqual(sinks, [
        {index: 7, name: 'a', description: 'a', activePort: null},
        {index: 8, name: 'b', description: 'B', activePort: null},
    ]);
});

test('parseSinks accepts the recorded pactl output', async () => {
    const {readFileSync} = await import('node:fs');
    const sinks = parseSinks(readFileSync(new URL('./fixtures/sinks.json', import.meta.url), 'utf8'));
    assert.ok(sinks.length > 0);
    for (const s of sinks) {
        assert.equal(typeof s.index, 'number');
        assert.ok(s.name.length > 0);
    }
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

test('spokenName gives short distinct names for each output', () => {
    assert.equal(spokenName('HDMI / DisplayPort 2 Output · GB203 High'), 'HDMI 2');
    assert.equal(spokenName('HDMI / DisplayPort · GB203 High'), 'HDMI');
    assert.equal(spokenName('HDMI / DisplayPort 3 Output · 800 Series'), 'HDMI 3');
    assert.equal(spokenName('Second Line Output · 800 Series'), 'Line out 2');
});
