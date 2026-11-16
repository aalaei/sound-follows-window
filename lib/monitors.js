// SPDX-License-Identifier: GPL-2.0-or-later
// Pure logic: no GNOME imports, so it can be unit-tested with node.

/** Name used for "no speaker assigned". */
export const UNASSIGNED = '';

/**
 * Stable monitor id built from the connector plus EDID identity (R5).
 * @param {{connector: string, vendor: string, product: string, serial: string}} m
 * @returns {string}
 */
export function monitorId({connector, vendor, product, serial}) {
    return [connector, vendor, product, serial].join('|');
}

/**
 * Parse the `monitors` part of Mutter's DisplayConfig.GetCurrentState
 * (already deep-unpacked into plain JS).
 * @param {Array} monitors each entry is [[connector, vendor, product, serial], modes, props]
 * @returns {{id: string, connector: string, vendor: string, product: string, serial: string, name: string}[]}
 */
export function parseMonitors(monitors) {
    return monitors.map(([[connector, vendor, product, serial], , props]) => ({
        id: monitorId({connector, vendor, product, serial}),
        connector,
        vendor,
        product,
        serial,
        name: displayName(props?.['display-name']) || connector,
    }));
}

/**
 * Mutter's a{sv} values can still be GVariant wrappers after deepUnpack.
 * Return the plain string, or '' when there is none.
 * @param {unknown} value
 * @returns {string}
 */
function displayName(value) {
    const plain = typeof value?.deepUnpack === 'function' ? value.deepUnpack() : value;
    return typeof plain === 'string' ? plain : '';
}

/**
 * Parse the `logical_monitors` part of GetCurrentState (deep-unpacked).
 * Each logical monitor is a rectangle in the global layout, and lists the
 * physical monitors it is made of (more than one when mirrored).
 * @param {Array} logical each entry is [x, y, scale, transform, primary, [[c, v, p, s], ...], props]
 * @returns {{x: number, y: number, ids: string[]}[]}
 */
export function parseLogicalMonitors(logical) {
    return logical.map(([x, y, , , , physical]) => ({
        x,
        y,
        ids: physical.map(([connector, vendor, product, serial]) =>
            monitorId({connector, vendor, product, serial})),
    }));
}

/**
 * Build the dropdown contents for one monitor. Index 0 is always "Unassigned".
 * A saved sink that is currently missing (monitor off, device unplugged) is
 * kept in the list so the choice is not lost (R6).
 * @param {{name: string, description: string}[]} sinks
 * @param {string | undefined} storedName the saved sink name for this monitor
 * @returns {{options: {name: string, label: string}[], selectedIndex: number}}
 */
export function buildSinkOptions(sinks, storedName) {
    const options = [
        {name: UNASSIGNED, label: 'Unassigned'},
        ...sinks.map(s => ({name: s.name, label: s.description})),
    ];
    if (storedName && !sinks.some(s => s.name === storedName))
        options.push({name: storedName, label: `${storedName} (not connected)`});

    const wanted = storedName || UNASSIGNED;
    const selectedIndex = Math.max(0, options.findIndex(o => o.name === wanted));
    return {options, selectedIndex};
}

/**
 * Return a new mapping with one monitor set to a sink (or cleared).
 * @param {Record<string, string>} map
 * @param {string} id monitor id
 * @param {string} sinkName sink name, or UNASSIGNED to remove the entry
 * @returns {Record<string, string>}
 */
export function withMapping(map, id, sinkName) {
    const next = {...map};
    if (sinkName === UNASSIGNED)
        delete next[id];
    else
        next[id] = sinkName;
    return next;
}

/**
 * A short, distinct name for an output to be spoken aloud.
 * "HDMI / DisplayPort 2 Output · GB203 High" -> "HDMI 2"
 * "HDMI / DisplayPort · GB203 High"          -> "HDMI"
 * "Second Line Output · 800 Series"          -> "Line out 2"
 * @param {string} label
 * @returns {string}
 */
export function spokenName(label) {
    const port = label.split(' · ')[0];
    if (/second line/i.test(port))
        return 'Line out 2';
    return port
        .replace(/\s*\/\s*DisplayPort/i, '')
        .replace(/\boutput\b/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}
