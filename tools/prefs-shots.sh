#!/usr/bin/env bash
# Salva capturas das paginas Barra e Popup das preferencias (gjs puro, configuracoes em memoria).
# Uso: EC_SHOT_DIR=/pasta ./tools/prefs-shots.sh
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
: "${EC_SHOT_DIR:?defina EC_SHOT_DIR com a pasta de saida}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/eltob-clock-shots.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/ext" "$WORK/config" "$EC_SHOT_DIR"
cp -r "$ROOT_DIR"/src/{metadata.json,presets.js,layoutlogic.js,labs.js,schemas} "$WORK/ext/"
glib-compile-schemas "$WORK/ext/schemas"
cp "$ROOT_DIR/tools/tests/prefs-shim.js" "$WORK/ext/shim.js"
cp "$ROOT_DIR/tools/tests/prefs-shots.js" "$WORK/ext/"
sed "s#resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js#./shim.js#" "$ROOT_DIR/src/prefs.js" > "$WORK/ext/prefs.js"
(cd "$WORK/ext" && XDG_CONFIG_HOME="$WORK/config" GSETTINGS_BACKEND=memory timeout 40 gjs -m prefs-shots.js 2>&1 | grep -E 'SHOT|rror' || true)
