# Changelog

## Unreleased

- Project skeleton: metadata, GSettings schema, Makefile, unit tests.
- Preferences window: assign a speaker to each connected monitor, and a verbose-logging switch.
- Routing (phase 1): streams are matched to windows (PID, Flatpak app ID, PID ancestry, name)
  and moved to the speaker of their window's monitor. Follow-focus policy only.
- Moves are debounced by 300 ms and skipped while a window is being dragged.
- Manual moves are respected until the target monitor changes.
