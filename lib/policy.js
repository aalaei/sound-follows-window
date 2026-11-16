// SPDX-License-Identifier: GPL-2.0-or-later
// Decides the target output for each stream (spec sections 3.1 and 3.2).
// Pure: no GNOME imports.
//
// Phase 1 implements only the "follow focus" policy. Targets are output keys
// (see lib/outputs.js); making an output ready is done later by the router.

import {matchWindows} from './matcher.js';
import {isOutputKey} from './outputs.js';

/** Stream roles that are never routed (R8). */
export const SKIPPED_ROLES = new Set(['event', 'notification']);

/**
 * Pick the window whose monitor should be used: the most recently focused.
 * @param {object[]} windows non-empty
 * @returns {object}
 */
export function followFocus(windows) {
    return windows.reduce((best, win) =>
        (win.lastFocus ?? 0) > (best.lastFocus ?? 0) ? win : best);
}

/**
 * Work out which output each stream should play on.
 * @param {object} input
 * @param {{index: number, sinkName: string | null, props: object}[]} input.streams
 * @param {object[]} input.windows window descriptors (see matcher.js)
 * @param {Record<string, string>} input.mapping monitor id -> output key
 * @param {Map<number, Set<number>>} [input.ancestors]
 * @returns {{decisions: {streamIndex: number, outputKey: string, windowId: number, rule: number}[],
 *            skipped: {streamIndex: number, reason: string}[]}}
 */
export function decideTargets({streams, windows, mapping, ancestors}) {
    const decisions = [];
    const skipped = [];

    for (const stream of streams) {
        const skip = reason => skipped.push({streamIndex: stream.index, reason});

        if (SKIPPED_ROLES.has(stream.props['media.role'])) {
            skip('role');
            continue;
        }

        const match = matchWindows(stream, windows, {ancestors});
        if (!match) {
            skip('no-window');
            continue;
        }

        const win = followFocus(match.windows);
        if (!win.monitorId) {
            skip('no-monitor');
            continue;
        }

        // Values saved by earlier versions (plain sink names) are not outputs.
        const outputKey = mapping[win.monitorId];
        if (!isOutputKey(outputKey)) {
            skip('unassigned');
            continue;
        }

        decisions.push({streamIndex: stream.index, outputKey, windowId: win.id, rule: match.rule});
    }

    return {decisions, skipped};
}
