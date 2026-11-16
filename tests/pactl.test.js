// SPDX-License-Identifier: GPL-2.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {parseSinkInputs, parseSinks, parseSubscribeLine} from '../lib/pactl.js';

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parseSinkInputs resolves the sink name of a real paplay stream', () => {
    const sinks = parseSinks(fixture('sinks.json'));
    const sink68 = sinks.find(s => s.index === 68);
    assert.ok(sink68, 'fixture sink 68 exists');

    const [stream] = parseSinkInputs(fixture('paplay-sink-input.json'), sinks);
    assert.equal(stream.index, 1925);
    assert.equal(stream.sinkIndex, 68);
    assert.equal(stream.sinkName, sink68.name);
    assert.equal(stream.props['application.process.id'], '216519');
    assert.equal(stream.props['application.name'], 'paplay');
});

test('parseSinkInputs leaves sinkName null for an unknown sink', () => {
    const [stream] = parseSinkInputs(fixture('paplay-sink-input.json'), []);
    assert.equal(stream.sinkName, null);
});

test('parseSubscribeLine reads stream and sink events', () => {
    assert.deepEqual(parseSubscribeLine("Event 'new' on sink-input #1925"),
        {action: 'new', kind: 'sink-input', index: 1925});
    assert.deepEqual(parseSubscribeLine("Event 'change' on sink #68"),
        {action: 'change', kind: 'sink', index: 68});
    assert.equal(parseSubscribeLine("Event 'change' on server #0"), null);
    assert.equal(parseSubscribeLine(''), null);
});
