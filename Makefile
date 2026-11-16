UUID := sound-follows-window@aalaei.github.io
DEST := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SCHEMA_DIR := $(DEST)/schemas

.PHONY: schemas install pack test nested clean

schemas:
	glib-compile-schemas schemas/

install: schemas
	rm -rf "$(DEST)"
	mkdir -p "$(DEST)"
	cp -r metadata.json extension.js prefs.js lib schemas "$(DEST)/"

pack: schemas
	mkdir -p dist
	gnome-extensions pack --force --extra-source=lib --out-dir=dist .

test:
	npm test

# Runs a nested GNOME Shell in its own D-Bus session for 60 seconds.
# Settings go to the memory backend, so your real settings are not changed.
nested: install
	GSETTINGS_SCHEMA_DIR="$(SCHEMA_DIR)" GSETTINGS_BACKEND=memory timeout 60 \
		dbus-run-session -- sh -c "gsettings set org.gnome.shell disable-user-extensions false; \
		gsettings set org.gnome.shell enabled-extensions '[\"$(UUID)\"]'; \
		gsettings set org.gnome.shell.extensions.sound-follows-window debug-logging true; \
		gnome-shell --devkit"

clean:
	rm -rf dist schemas/gschemas.compiled
