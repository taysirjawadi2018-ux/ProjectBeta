#!/usr/bin/env node
/**
 * Convert a gettext .po catalog into the flat JSON the BFF loads.
 *
 * The .po files stay the reviewable source of truth — they carry the source
 * references and the translator comments, and they are what a translator's
 * tooling understands. This script is committed alongside the generated JSON so
 * the conversion is auditable rather than a one-off paste.
 *
 * Usage:
 *   node tools/po-to-json.mjs ../frontend_flask/translations/fr/LC_MESSAGES/messages.po > i18n/messages/fr.json
 *
 * Output is keyed on the English source string, exactly as gettext keys it.
 * Entries with an empty msgstr are dropped rather than emitted as "", because
 * an empty string is a rendered blank on the page while a missing key falls
 * through to readable English.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Unescape a single quoted PO string body (the text between the quotes). */
function unescape(body) {
  return body.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, esc) => {
    switch (esc[0]) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case 'u':
        return String.fromCharCode(Number.parseInt(esc.slice(1), 16));
      default:
        // Covers \" and \\, and leaves anything unexpected as its own literal.
        return esc;
    }
  });
}

/** The body of a `"..."` line, or null if the line is not one. */
function quoted(line) {
  const match = line.match(/^\s*"(.*)"\s*$/);
  return match ? unescape(match[1]) : null;
}

export function parsePo(text) {
  const catalog = {};

  let msgid = null;
  let msgstr = null;
  let field = null; // which of the two a bare "..." line continues

  const flush = () => {
    // msgid "" is the header entry, and an empty msgstr is an untranslated
    // string; neither belongs in the catalog.
    if (msgid && msgstr) catalog[msgid] = msgstr;
    msgid = null;
    msgstr = null;
    field = null;
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#')) continue; // comments, references, flags

    if (trimmed === '') {
      flush();
      continue;
    }

    if (trimmed.startsWith('msgid ')) {
      // A new msgid without a blank line first still ends the previous entry.
      if (msgid !== null && field === 'msgstr') flush();
      msgid = quoted(trimmed.slice(6)) ?? '';
      msgstr = '';
      field = 'msgid';
      continue;
    }

    if (trimmed.startsWith('msgstr ')) {
      msgstr = quoted(trimmed.slice(7)) ?? '';
      field = 'msgstr';
      continue;
    }

    // A bare "..." line continues whichever field is open. This is how gettext
    // wraps anything longer than a line, so dropping these silently truncates
    // every long string to its first fragment.
    const continuation = quoted(trimmed);
    if (continuation !== null && field) {
      if (field === 'msgid') msgid += continuation;
      else msgstr += continuation;
    }
  }

  flush();
  return catalog;
}

// Only when run as a command. Without this guard, importing parsePo from the
// test suite executes the CLI and exits the process.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: po-to-json.mjs <messages.po>');
    process.exit(2);
  }

  const catalog = parsePo(readFileSync(path, 'utf8'));
  // Sorted so a regenerated catalog produces a reviewable diff rather than a
  // reshuffle.
  const sorted = Object.fromEntries(Object.entries(catalog).sort(([a], [b]) => (a < b ? -1 : 1)));
  process.stdout.write(`${JSON.stringify(sorted, null, 2)}\n`);
}
