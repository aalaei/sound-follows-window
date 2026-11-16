// SPDX-License-Identifier: GPL-2.0-or-later
// Pure parsing of /proc/<pid>/stat. No GNOME imports.

/**
 * Parent pid from the content of /proc/<pid>/stat.
 * The command name is in parentheses and may contain spaces or ')', so
 * parsing starts after the last ')'.
 * @param {string} stat
 * @returns {number | null}
 */
export function parsePpid(stat) {
    const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const ppid = Number(rest[1]);
    return Number.isFinite(ppid) ? ppid : null;
}
