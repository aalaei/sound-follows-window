// SPDX-License-Identifier: GPL-2.0-or-later
// Pure parsers for `pactl` output. No GNOME imports.

/**
 * Parse `pactl -f json list sinks`.
 * @param {string} jsonText
 * @returns {{index: number, name: string, description: string, activePort: string | null}[]}
 */
export function parseSinks(jsonText) {
    return JSON.parse(jsonText).map(s => ({
        index: s.index,
        name: s.name,
        description: sinkLabel(s),
        activePort: s.active_port ?? null,
    }));
}

/**
 * Human label for a sink: its active port plus a short card name, so that
 * several outputs of the same chipset stay distinguishable.
 * e.g. "HDMI / DisplayPort 1 Output · 800 Series" or "Second Line Output · 800 Series".
 * @param {object} s one entry of `pactl -f json list sinks`
 * @returns {string}
 */
export function sinkLabel(s) {
    const port = s.ports?.find(p => p.name === s.active_port)?.description ?? s.active_port ?? '';
    const card = (s.properties?.['device.product.name'] ?? '').split(' ').slice(0, 2).join(' ');
    return [port, card].filter(Boolean).join(' · ') || s.description || s.name;
}

/**
 * Parse `pactl -f json list sink-inputs` (one entry per playing stream).
 * @param {string} jsonText
 * @param {{index: number, name: string}[]} sinks result of parseSinks
 * @returns {{index: number, sinkIndex: number, sinkName: string | null, props: Record<string, string>}[]}
 */
export function parseSinkInputs(jsonText, sinks) {
    const nameByIndex = new Map(sinks.map(s => [s.index, s.name]));
    return JSON.parse(jsonText).map(i => ({
        index: i.index,
        sinkIndex: i.sink,
        sinkName: nameByIndex.get(i.sink) ?? null,
        props: i.properties ?? {},
    }));
}

/**
 * Parse one line of `pactl subscribe`, e.g. "Event 'new' on sink-input #1925".
 * @param {string} line
 * @returns {{action: string, kind: 'sink' | 'sink-input', index: number} | null}
 */
export function parseSubscribeLine(line) {
    const m = /Event '(\w+)' on (sink-input|sink) #(\d+)/.exec(line);
    if (!m)
        return null;
    return {action: m[1], kind: m[2], index: Number(m[3])};
}
