UUID := sound-follows-window@ali.local
DEST := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: schemas install pack test clean

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

clean:
	rm -rf dist schemas/gschemas.compiled
