// SPDX-License-Identifier: GPL-2.0-or-later
// Outputs are card ports ("HDMI / DisplayPort 2 on the graphics card"), not
// sinks. A sink only exists for the card's active profile, and a port can
// belong to several profiles, so a monitor is saved as card + port and the
// extension switches profile/port when needed. Pure: no GNOME imports.

/**
 * Stable key for an output: "<card name>|<port name>".
 * @param {string} cardName e.g. "alsa_card.pci-0000_53_00.1"
 * @param {string} portName e.g. "hdmi-output-1"
 * @returns {string}
 */
export function outputKey(cardName, portName) {
    return `${cardName}|${portName}`;
}

/** @param {unknown} key @returns {boolean} true for keys in the new format */
export function isOutputKey(key) {
    return typeof key === 'string' && key.includes('|');
}

/**
 * @param {string} key
 * @returns {{card: string, port: string} | null}
 */
export function parseKey(key) {
    if (!isOutputKey(key))
        return null;
    const i = key.indexOf('|');
    return {card: key.slice(0, i), port: key.slice(i + 1)};
}

/** "800 Series Chipset Family ..." -> "800 Series". */
function shortCardName(card) {
    const name = card.properties?.['device.product.name'] || card.description || card.name;
    return name.split(' ').slice(0, 2).join(' ');
}

/**
 * Parse `pactl -f json list cards`.
 * @param {string} jsonText
 * @returns {{name: string, activeProfile: string, cardLabel: string,
 *            profiles: Record<string, {available: boolean}>,
 *            ports: {name: string, description: string, availability: string, profiles: string[]}[]}[]}
 */
export function parseCards(jsonText) {
    return JSON.parse(jsonText).map(c => ({
        name: c.name,
        activeProfile: c.active_profile,
        cardLabel: shortCardName(c),
        profiles: Object.fromEntries(Object.entries(c.profiles ?? {})
            .map(([n, p]) => [n, {available: p.available !== false}])),
        ports: Object.entries(c.ports ?? {}).map(([n, p]) => ({
            name: n,
            description: p.description || n,
            availability: p.availability ?? 'unknown',
            profiles: p.profiles ?? [],
        })),
    }));
}

/** Input ports (microphones) are not outputs. */
function isOutputPort(port) {
    return !port.name.includes('[In]') && !/microphone/i.test(port.description);
}

/**
 * The outputs the user can choose right now: output ports that are not
 * reported as "not available" (a monitor or jack is connected).
 * @param {ReturnType<typeof parseCards>} cards
 * @returns {{key: string, card: string, port: string, label: string}[]}
 */
export function listOutputs(cards) {
    const outputs = [];
    for (const card of cards) {
        for (const port of card.ports) {
            if (!isOutputPort(port) || port.availability === 'not available')
                continue;
            outputs.push({
                key: outputKey(card.name, port.name),
                card: card.name,
                port: port.name,
                label: `${port.description} · ${card.cardLabel}`,
            });
        }
    }
    return outputs;
}

/**
 * Decide what must happen before an output can play.
 *
 * - {action: 'ready', sinkName}: a sink already plays this port.
 * - {action: 'set-port', sinkName, port}: the card's sink exists, but on another port.
 * - {action: 'switch-profile', card, profile}: a profile that exposes the port must be chosen first.
 * - {action: 'missing'}: the output is unknown, unplugged, or no usable profile has it.
 *
 * @param {string} key output key
 * @param {{cards: ReturnType<typeof parseCards>, sinks: {name: string, activePort: string | null}[]}} state
 * @returns {object}
 */
export function planOutput(key, {cards, sinks}) {
    const parsed = parseKey(key);
    if (!parsed)
        return {action: 'missing'};

    const card = cards.find(c => c.name === parsed.card);
    const port = card?.ports.find(p => p.name === parsed.port);
    if (!card || !port || port.availability === 'not available')
        return {action: 'missing'};

    const prefix = `${card.name.replace(/^alsa_card\./, 'alsa_output.')}.`;
    const cardSinks = sinks.filter(s => s.name.startsWith(prefix));

    const direct = cardSinks.find(s => s.activePort === port.name);
    if (direct)
        return {action: 'ready', sinkName: direct.name};

    if (cardSinks.length === 1 && port.profiles.includes(card.activeProfile))
        return {action: 'set-port', sinkName: cardSinks[0].name, port: port.name};

    const profile = port.profiles.find(p => card.profiles[p]?.available);
    // Already on a profile that exposes the port but no sink appeared: switching
    // to the same profile would not help.
    if (!profile || profile === card.activeProfile)
        return {action: 'missing'};
    return {action: 'switch-profile', card: card.name, profile};
}
