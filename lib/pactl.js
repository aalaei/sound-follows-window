// SPDX-License-Identifier: GPL-2.0-or-later
// Pure parsers for `pactl` output. No GNOME imports.

/**
 * Parse `pactl -f json list sinks`.
 * @param {string} jsonText
 * @returns {{index: number, name: string, description: string}[]}
 */
export function parseSinks(jsonText) {
    return JSON.parse(jsonText).map(s => ({
        index: s.index,
        name: s.name,
        description: s.description || s.name,
    }));
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
