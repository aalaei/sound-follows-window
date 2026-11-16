// SPDX-License-Identifier: GPL-2.0-or-later
// Makes an output ready to play: switches the card profile or sink port
// when needed, then returns the sink name to use. Uses pactl only.

import GLib from 'gi://GLib';

import {parseCards, planOutput} from './outputs.js';
import {parseSinks} from './pactl.js';
import {run} from './system.js';

const MAX_STEPS = 6;
const PROFILE_SETTLE_MS = 700;

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

/**
 * Current cards and sinks, read with pactl.
 * @param {import('gi://Gio').Cancellable | null} [cancellable]
 * @returns {Promise<{cards: ReturnType<typeof parseCards>, sinks: ReturnType<typeof parseSinks>}>}
 */
export async function readState(cancellable = null) {
    const [cardsJson, sinksJson] = await Promise.all([
        run(['pactl', '-f', 'json', 'list', 'cards'], cancellable),
        run(['pactl', '-f', 'json', 'list', 'sinks'], cancellable),
    ]);
    return {cards: parseCards(cardsJson), sinks: parseSinks(sinksJson)};
}

/**
 * Make an output ready and return the sink to play on, or null if it is not
 * available right now.
 * @param {string} key output key (see lib/outputs.js)
 * @param {object} [options]
 * @param {import('gi://Gio').Cancellable | null} [options.cancellable]
 * @param {(msg: string) => void} [options.log]
 * @returns {Promise<string | null>}
 */
export async function ensureOutput(key, {cancellable = null, log = () => {}} = {}) {
    for (let step = 0; step < MAX_STEPS; step++) {
        const state = await readState(cancellable);
        const plan = planOutput(key, state);
        log(`output ${key}: ${plan.action}`);

        switch (plan.action) {
            case 'ready':
                return plan.sinkName;
            case 'set-port':
                await run(['pactl', 'set-sink-port', plan.sinkName, plan.port], cancellable);
                return plan.sinkName;
            case 'switch-profile':
                await run(['pactl', 'set-card-profile', plan.card, plan.profile], cancellable);
                await sleep(PROFILE_SETTLE_MS);
                break;
            default:
                return null;
        }
    }
    return null;
}
