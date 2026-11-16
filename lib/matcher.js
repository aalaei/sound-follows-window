// SPDX-License-Identifier: GPL-2.0-or-later
// Matching audio streams to windows (spec section 4). Pure: no GNOME imports.
//
// A window descriptor:
//   {id, pid, appId, sandboxAppId, wmClass, wmInstance, gtkAppId, monitorId, lastFocus}
// A stream is a parsed `pactl` sink-input: {index, sinkName, props}.
// `ancestors` is a Map from a process id to the Set of its ancestor pids,
// loaded beforehand by the caller (see lib/procfs.js).

/**
 * Normalise an app name for comparison: lowercase, drop ".desktop",
 * and drop a reverse-DNS prefix ("org.mozilla.firefox" -> "firefox").
 * @param {string | null | undefined} s
 * @returns {string} empty string when there is nothing to compare
 */
export function normalizeName(s) {
    if (!s)
        return '';
    let v = String(s).trim().toLowerCase().replace(/\.desktop$/, '');
    if (/^[a-z0-9_-]+(\.[a-z0-9_-]+){2,}$/.test(v))
        v = v.split('.').pop();
    return v;
}

const streamPid = stream => Number(stream.props['application.process.id']) || null;

/** Rule 2: Flatpak / sandbox app ID. */
function matchSandboxId(stream, win) {
    const app = normalizeName(stream.props['pipewire.access.portal.app_id'] ||
        stream.props['application.id']);
    if (!app)
        return false;
    return [win.sandboxAppId, win.appId].some(id => normalizeName(id) === app);
}

/** Rule 3: the stream's process is the window's process. */
function matchExactPid(stream, win) {
    const pid = streamPid(stream);
    return pid !== null && pid === win.pid;
}

/** Rule 4: the stream's process is a child of the window's process (e.g. Chromium audio service). */
function matchAncestry(stream, win, ancestors) {
    const pid = streamPid(stream);
    if (pid === null || win.pid === null || !ancestors)
        return false;
    return ancestors.get(pid)?.has(win.pid) ?? false;
}

/** Rule 5: name heuristics. */
function matchName(stream, win) {
    const streamNames = [
        stream.props['application.process.binary'],
        stream.props['application.name'],
        stream.props['application.id'],
    ].map(normalizeName).filter(Boolean);
    const winNames = [win.wmClass, win.wmInstance, win.gtkAppId, win.appId]
        .map(normalizeName).filter(Boolean);
    return streamNames.some(s => winNames.includes(s));
}

const RULES = [
    [2, (stream, win) => matchSandboxId(stream, win)],
    [3, (stream, win) => matchExactPid(stream, win)],
    [4, (stream, win, ctx) => matchAncestry(stream, win, ctx.ancestors)],
    [5, (stream, win) => matchName(stream, win)],
];

/**
 * Find the windows a stream belongs to. The first rule that matches any
 * window wins, so a PID match is never overridden by a name guess.
 * @param {object} stream
 * @param {object[]} windows
 * @param {{ancestors?: Map<number, Set<number>>}} [ctx]
 * @returns {{rule: number, windows: object[]} | null}
 */
export function matchWindows(stream, windows, ctx = {}) {
    for (const [rule, test] of RULES) {
        const hits = windows.filter(win => test(stream, win, ctx));
        if (hits.length > 0)
            return {rule, windows: hits};
    }
    return null;
}
