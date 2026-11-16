# Sound Follows Window

GNOME Shell extension that will move each app's sound to the speakers of the
monitor its window is on.

## Status

Phase 1, first step: the **Monitors** preferences page. You choose which speaker
each connected monitor should use. Saved choices are stored in GSettings. The
routing itself is not implemented yet, so nothing moves until the next step.

## Install

Requires GNOME Shell 51 and PipeWire with `pactl`.

```sh
make install
```

Then restart your session (on Wayland, log out and back in), enable
"Sound Follows Window", and open its settings.

## Development

```sh
make test      # unit tests for lib/monitors.js (node)
make schemas   # compile the GSettings schema
make pack      # build dist/*.shell-extension.zip
```

The UUID in `metadata.json` and the `Makefile` is a local placeholder
(`sound-follows-window@ali.local`). Change it before publishing.

## How monitors are identified

Monitors are keyed by connector plus EDID (`DP-4|RTK|0x2555|serial`), not by
index, so a monitor keeps its speaker after re-plugging. If the monitor is
plugged into another port, its connector changes and it must be assigned again.

Speakers are keyed by PipeWire node name. If a saved speaker is missing (off or
unplugged), it stays listed as "(not connected)" and nothing is routed to it.

## Known limitations

- All tabs and windows of one browser share one audio process, so per-tab
  routing is not possible from the desktop side.
- Monitors that are switched off are not reported by Mutter, so they can't be
  configured until they are connected.
