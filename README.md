# Sound Follows Window

GNOME Shell extension that moves each app's sound to the speakers of the
monitor its window is on.

## Status (phase 1)

- **Monitors page:** choose a speaker for each connected monitor. Saved in GSettings.
- **Routing:** when an app plays audio, its stream moves to the speaker of its
  window's monitor. A window dragged to another monitor moves its audio after
  the drag ends (or after 300 ms). Only the "follow focus" policy is implemented.
- **Not yet:** pins, the Quick Settings menu, exclusions, headphone pause,
  master toggle, D-Bus API.

## Install

Requires GNOME Shell 51 and PipeWire with `pactl`.

```sh
make install
```

Then log out and back in (on Wayland, a new extension is only listed after a
new session), enable "Sound Follows Window", and open its settings.

## Development

```sh
make test      # unit tests (node): matcher, policy, pactl and monitor parsing
make schemas   # compile the GSettings schema
make pack      # build dist/*.shell-extension.zip
make nested    # run a nested GNOME Shell for 60 s (settings are not saved)
```

## How things are identified

- **Monitors** are keyed by connector plus EDID (`DP-4|RTK|0x2555|serial`), not
  by index, so a monitor keeps its speaker after re-plugging. Plugging it into a
  different port changes the connector, so it must be assigned again.
- **Speakers** are keyed by PipeWire node name. If a saved speaker is missing
  (off or unplugged), it stays listed as "(not connected)" and nothing is routed
  to it.
- **Streams** are matched to windows in this order, and the first rule that
  matches wins:
  1. Flatpak / sandbox app ID
  2. the stream's process is the window's process
  3. the stream's process is a child of the window's process (Chromium, Electron)
  4. the app names match (normalised)

## Manual changes

If you move an app's stream yourself (pavucontrol), the extension won't move it
back until that window goes to a different monitor.

## Troubleshooting

Turn on "Verbose logging" in the preferences, reproduce the problem, then run:

```sh
journalctl -f -o cat /usr/bin/gnome-shell
```

## Known limitations

- All tabs and windows of one browser share one audio process, so per-tab
  routing is not possible from the desktop side. Such a browser follows its
  most recently focused window.
- Monitors that are switched off are not reported by Mutter, so they can't be
  configured until they are connected.
- The extension's UUID is `sound-follows-window@aalaei.github.io`.
