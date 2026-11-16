// SPDX-License-Identifier: GPL-2.0-or-later
// Process ancestry from /proc, read asynchronously.

import {parsePpid} from './procstat.js';
import {readText} from './system.js';

const MAX_DEPTH = 32;

/**
 * For each pid, the set of its ancestors up to init. Unreadable pids
 * (process gone, or in another sandbox) are left out.
 * @param {number[]} pids
 * @param {import('gi://Gio').Cancellable | null} [cancellable]
 * @returns {Promise<Map<number, Set<number>>>}
 */
export async function loadAncestors(pids, cancellable = null) {
    const result = new Map();
    for (const pid of new Set(pids)) {
        const ancestors = new Set();
        let current = pid;
        for (let depth = 0; depth < MAX_DEPTH; depth++) {
            let ppid;
            try {
                ppid = parsePpid(await readText(`/proc/${current}/stat`, cancellable));
            } catch {
                break;
            }
            if (ppid === null || ppid <= 1)
                break;
            ancestors.add(ppid);
            current = ppid;
        }
        result.set(pid, ancestors);
    }
    return result;
}
