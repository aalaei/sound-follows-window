// SPDX-License-Identifier: GPL-2.0-or-later
// Decides the target sink for each stream (spec sections 3.1 and 3.2).
// Pure: no GNOME imports.
//
// Phase 1 implements only the "follow focus" policy.

import {matchWindows} from './matcher.js';

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
 * Work out where each stream should play.
 * @param {object} input
 * @param {{index: number, sinkName: string | null, props: object}[]} input.streams
 * @param {object[]} input.windows window descriptors (see matcher.js)
 * @param {Record<string, string>} input.mapping monitor id -> sink name
 * @param {Set<string>} input.sinkNames sinks that exist right now
 * @param {Map<number, Set<number>>} [input.ancestors]
 * @returns {{decisions: {streamIndex: number, sinkName: string, windowId: number, rule: number}[],
 *            skipped: {streamIndex: number, reason: string}[]}}
 */
export function decideTargets({streams, windows, mapping, sinkNames, ancestors}) {
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

        const sinkName = mapping[win.monitorId];
        if (!sinkName) {
            skip('unassigned');
            continue;
        }

        if (!sinkNames.has(sinkName)) {
            skip('sink-missing');
            continue;
        }

        decisions.push({streamIndex: stream.index, sinkName, windowId: win.id, rule: match.rule});
    }

    return {decisions, skipped};
}

/**
 * Should the router move a stream now?
 *
 * - Never when the stream already plays on the target.
 * - Never twice for the same target. This is what respects manual choices
 *   (R7): if the user moved the stream away, we do not move it back until
 *   the target itself changes.
 *
 * @param {{desired: string, actual: string | null, applied: string | undefined}} s
 * @returns {boolean}
 */
export function needsMove({desired, actual, applied}) {
    if (actual === desired)
        return false;
    return applied !== desired;
}
