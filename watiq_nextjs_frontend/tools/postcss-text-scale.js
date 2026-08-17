/**
 * Multiply every font-size in the compiled stylesheet by --w-text-scale.
 *
 * The reader's text-size control needs to move ALL text, and this codebase
 * sizes text three different ways: design tokens (text-body-md ->
 * var(--w-fs-body-md)), Tailwind's preset scale (text-sm), and arbitrary
 * values (text-[10px], 251 of them, skewed towards the smallest sizes -- which
 * is precisely the text someone with failing eyesight needs enlarged). Wrapping
 * the tokens alone would leave roughly 460 literal sizes fixed and the feature
 * half-working.
 *
 * Doing it here instead catches all three, plus the 24px on
 * .material-symbols-outlined so icons keep pace with their labels, and it keeps
 * working when someone adds a new arbitrary size to a template later. Every
 * font-size in the shipped CSS passes through this file: the per-page sheets in
 * static/css/pages/ declare none.
 *
 * --w-text-scale is set by the .text-scale-* classes in static/src/_theme.css
 * and defaults to 1, so unscaled output is byte-identical in effect.
 */
module.exports = () => ({
  postcssPlugin: "watiq-text-scale",
  Declaration: {
    "font-size": (decl) => {
      const value = decl.value.trim();

      // Idempotent: re-running the build must not nest calc() forever.
      if (value.includes("--w-text-scale")) return;

      // Keywords carry no length to scale, and a bare 0 is unaffected by
      // multiplication. A var() reference does need scaling even though it
      // holds no digits of its own -- that is how every design token arrives.
      if (value === "0") return;
      if (/^[a-z-]+$/i.test(value)) return;
      if (!/[\d.]/.test(value) && !value.includes("var(")) return;

      // em is already relative to the parent's scaled size, so multiplying
      // again compounds the scale at every level of nesting. Match the unit
      // only where a number precedes it, which leaves rem (absolute here,
      // and genuinely in need of scaling) alone.
      if (/[\d.]\s*em\b/i.test(value)) return;

      decl.value = `calc(${value} * var(--w-text-scale, 1))`;
    },
  },
});

module.exports.postcss = true;
