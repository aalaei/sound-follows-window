// SPDX-License-Identifier: GPL-2.0-or-later
// Outputs from the real `pactl -f json list cards` recorded on this machine.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {isOutputKey, listOutputs, outputKey, parseCards, parseKey, planOutput} from '../lib/outputs.js';
import {parseSinks} from '../lib/pactl.js';

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const cards = parseCards(fixture('cards.json'));
const sinks = parseSinks(fixture('sinks.json'));

const GPU = 'alsa_card.pci-0000_53_00.1';
const INTEL = 'alsa_card.pci-0000_80_1f.3-platform-skl_hda_dsp_generic';

test('outputKey and parseKey round-trip', () => {
    const key = outputKey(GPU, 'hdmi-output-1');
    assert.equal(key, `${GPU}|hdmi-output-1`);
    assert.deepEqual(parseKey(key), {card: GPU, port: 'hdmi-output-1'});
    assert.equal(parseKey('alsa_output.something'), null);
    assert.equal(isOutputKey('alsa_output.something'), false);
});

test('listOutputs shows connected output ports only, with distinct labels', () => {
    const outputs = listOutputs(cards);
    const keys = outputs.map(o => o.key);

    assert.ok(keys.includes(`${GPU}|hdmi-output-0`), 'graphics card HDMI / DisplayPort');
    assert.ok(keys.includes(`${GPU}|hdmi-output-1`), 'graphics card HDMI / DisplayPort 2 (JMG)');
    assert.ok(keys.includes(`${INTEL}|[Out] Line2`), 'Second Line Output');
    assert.ok(!keys.some(k => k.includes('[In]') || /Mic/.test(k)), 'microphones are not outputs');
    assert.ok(!keys.includes(`${INTEL}|[Out] HDMI1`), 'HDMI 1 on the Intel card has no monitor');

    const labels = outputs.map(o => o.label);
    assert.equal(new Set(labels).size, labels.length, labels.join(' | '));
    assert.ok(labels.includes('HDMI / DisplayPort 2 · GB203 High'), labels.join(' | '));
});

test('planOutput: an output already playing is ready with its sink', () => {
    const plan = planOutput(`${INTEL}|[Out] Line2`, {cards, sinks});
    assert.equal(plan.action, 'ready');
    assert.equal(plan.sinkName, 'alsa_output.pci-0000_80_1f.3-platform-skl_hda_dsp_generic.HiFi__Line2__sink');
});

test('planOutput: an HDMI port with no monitor connected is missing, even if a sink exists', () => {
    const plan = planOutput(`${INTEL}|[Out] HDMI1`, {cards, sinks});
    assert.equal(plan.action, 'missing');
});

test('planOutput: same card, other port on the active sink -> set the sink port', () => {
    // Recorded sinks show the graphics card on hdmi-output-0; the JMG is hdmi-output-1,
    // which the active profile (hdmi-stereo-extra1) exposes.
    const plan = planOutput(`${GPU}|hdmi-output-1`, {cards, sinks});
    assert.equal(plan.action, 'set-port');
    assert.equal(plan.port, 'hdmi-output-1');
    assert.equal(plan.sinkName, 'alsa_output.pci-0000_53_00.1.hdmi-stereo');
});

test('planOutput: port only in another profile -> switch profile', () => {
    // Pretend the card is on the plain stereo profile, which does not expose hdmi-output-1.
    const onStereo = cards.map(c => (c.name === GPU ? {...c, activeProfile: 'output:hdmi-stereo'} : c));
    const plan = planOutput(`${GPU}|hdmi-output-1`, {cards: onStereo, sinks: []});
    assert.equal(plan.action, 'switch-profile');
    assert.equal(plan.card, GPU);
    assert.equal(plan.profile, 'output:hdmi-stereo-extra1');
});

test('planOutput: a port whose profile is unavailable is missing', () => {
    // Intel Headphones: the only profile that exposes it is not available.
    const plan = planOutput(`${INTEL}|[Out] Headphones`, {cards, sinks});
    assert.equal(plan.action, 'missing');
});

test('planOutput: unknown card or malformed key is missing', () => {
    assert.equal(planOutput('nope|hdmi-output-1', {cards, sinks}).action, 'missing');
    assert.equal(planOutput('no-separator', {cards, sinks}).action, 'missing');
});
