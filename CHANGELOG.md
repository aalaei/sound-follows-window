# Changelog

## Unreleased

- Project skeleton: metadata, GSettings schema, Makefile, unit tests.
- Preferences window: assign a speaker to each connected monitor, and a verbose-logging switch.
- Routing (phase 1): streams are matched to windows (PID, Flatpak app ID, PID ancestry, name)
  and moved to the speaker of their window's monitor. Follow-focus policy only.
- Moves are debounced by 300 ms and skipped while a window is being dragged.
- Manual moves are respected until the target monitor changes.
- Outputs are card ports (for example "HDMI / DisplayPort 2 · GB203"), not sinks. Monitors
  are saved as card|port. The extension switches the card profile or sink port when a
  monitor needs an output that isn't active. Saved values from earlier versions are
  ignored, so reassign monitors once.
- Play speaks through the output's port, using the same switching.
