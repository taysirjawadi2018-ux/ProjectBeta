#!/usr/bin/env node
/**
 * Apply tools/postcss-text-scale.js to an already-compiled stylesheet.
 *
 * This runs as a step after `tailwindcss`, not as a plugin inside it. Passing
 * --postcss to the Tailwind CLI replaces its internal plugin chain rather than
 * extending it, which silently drops postcss-import: the three @import lines
 * in static/src/watiq.css survive into the output as literal rules pointing at
 * paths that are not served, taking every @font-face and design token with
 * them. Transforming the finished file avoids the whole question.
 *
 *   node tools/scale-text.js static/css/watiq.css
 */
const fs = require("fs");
const path = require("path");
const postcss = require("postcss");
const textScale = require("./postcss-text-scale.js");

const file = process.argv[2];
if (!file) {
  console.error("usage: node tools/scale-text.js <stylesheet>");
  process.exit(1);
}

const from = path.resolve(file);
const css = fs.readFileSync(from, "utf8");

postcss([textScale()])
  .process(css, { from, to: from })
  .then((result) => {
    fs.writeFileSync(from, result.css);
    const scaled = (result.css.match(/font-size:calc\([^;}]*--w-text-scale/g) || []).length;
    console.log(`text-scale: ${scaled} font-size declarations now follow --w-text-scale`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
