#!/usr/bin/env bash
# Extract, update and compile the translation catalogs.
#
#   tools/i18n.sh extract   rebuild messages.pot from templates/ and *.py
#   tools/i18n.sh update    merge new messages into fr/ and ar/, keeping work
#   tools/i18n.sh compile   build the .mo files Flask actually reads
#   tools/i18n.sh all       all three, in order
#
# Run from frontend_flask/. compile must be re-run after editing any .po --
# Flask reads the compiled .mo and will otherwise serve the previous wording.
set -euo pipefail
cd "$(dirname "$0")/.."
PYBABEL="${PYBABEL:-.venv/bin/pybabel}"
LOCALES="fr ar"

extract() {
  "$PYBABEL" extract -F babel.cfg -o translations/messages.pot \
      --sort-output --no-location \
      --project=Watiq --copyright-holder="Republic of Tunisia" .
}
update() {
  for l in $LOCALES; do
    if [ -d "translations/$l" ]; then
      "$PYBABEL" update -i translations/messages.pot -d translations -l "$l" --no-fuzzy-matching
    else
      "$PYBABEL" init -i translations/messages.pot -d translations -l "$l"
    fi
  done
}
compile() { "$PYBABEL" compile -d translations --statistics; }

case "${1:-all}" in
  extract) extract ;;
  update)  update ;;
  compile) compile ;;
  all)     extract; update; compile ;;
  *) echo "usage: $0 {extract|update|compile|all}" >&2; exit 1 ;;
esac
