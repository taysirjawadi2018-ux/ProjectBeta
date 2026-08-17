// The text-scale plugin MUST run after tailwindcss, so it sees the generated
// utilities' font-size declarations and not just the ones written by hand.
//
// See the plugin's own header for why this exists at all: dropping it produces
// a stylesheet that looks entirely correct and silently disables the whole
// text-size control — the classes are present, the toggle sets its cookie, the
// server renders the class onto <html>, and no text changes size, because no
// font-size in the sheet reads the variable those classes set.
//
// Plugins are named as strings, not require()d. Next.js validates this file and
// rejects a plugin instance with "Malformed PostCSS Configuration"; it resolves
// the names itself. The array form is used rather than the object form because
// the ordering above is load-bearing.
module.exports = {
  plugins: [
    'tailwindcss',
    'autoprefixer',
    './tools/postcss-text-scale.js',
  ],
};
