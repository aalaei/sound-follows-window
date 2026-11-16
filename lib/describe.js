// SPDX-License-Identifier: GPL-2.0-or-later
// One-line descriptions of streams and windows for the verbose log. Pure.

/**
 * @param {{index: number, sinkName: string | null, props: Record<string, string>}} s
 * @returns {string}
 */
export function describeStream(s) {
    const p = s.props;
    const fields = {
        app: p['application.name'],
        bin: p['application.process.binary'],
        appId: p['application.id'],
        pid: p['application.process.id'],
        portal: p['pipewire.access.portal.app_id'],
        role: p['media.role'],
        sink: s.sinkName,
    };
    return `stream #${s.index} ` + Object.entries(fields)
        .map(([k, v]) => `${k}=${v ?? '-'}`).join(' ');
}

/**
 * @param {object} w window descriptor (see lib/matcher.js)
 * @returns {string}
 */
export function describeWindow(w) {
    const fields = {
        pid: w.pid,
        class: w.wmClass,
        instance: w.wmInstance,
        app: w.appId,
        gtk: w.gtkAppId,
        sandbox: w.sandboxAppId,
        monitor: w.monitorId,
    };
    return `window #${w.id} ` + Object.entries(fields)
        .map(([k, v]) => `${k}=${v ?? '-'}`).join(' ');
}
