// SPDX-License-Identifier: GPL-2.0-or-later
// Async helpers for subprocesses, files and D-Bus. Nothing here blocks.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * Run a command and return its stdout.
 * @param {string[]} argv
 * @param {Gio.Cancellable | null} [cancellable]
 * @returns {Promise<string>}
 */
export function run(argv, cancellable = null) {
    return new Promise((resolve, reject) => {
        let proc;
        try {
            proc = Gio.Subprocess.new(
                argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            reject(e);
            return;
        }
        proc.communicate_utf8_async(null, cancellable, (p, res) => {
            try {
                const [, stdout, stderr] = p.communicate_utf8_finish(res);
                if (p.get_successful())
                    resolve(stdout);
                else
                    reject(new Error(stderr.trim() || `${argv[0]} exited with ${p.get_exit_status()}`));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Read a small text file asynchronously.
 * @param {string} path
 * @param {Gio.Cancellable | null} [cancellable]
 * @returns {Promise<string>}
 */
export function readText(path, cancellable = null) {
    return new Promise((resolve, reject) => {
        Gio.File.new_for_path(path).load_contents_async(cancellable, (file, res) => {
            try {
                const [, contents] = file.load_contents_finish(res);
                resolve(new TextDecoder().decode(contents));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Asynchronous session-bus method call.
 * @param {string} name bus name
 * @param {string} path object path
 * @param {string} iface interface
 * @param {string} method method name
 * @returns {Promise<GLib.Variant>}
 */
export function dbusCall(name, path, iface, method) {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(name, path, iface, method, null, null,
            Gio.DBusCallFlags.NONE, -1, null, (conn, res) => {
                try {
                    resolve(conn.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}
