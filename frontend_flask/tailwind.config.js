/**
 * Watiq design tokens.
 *
 * Lifted verbatim from the `tailwind.config` object that the twelve source
 * mockups inlined for the Play CDN (frontend/*.html). All twelve carried
 * identical values — 47 colours, 6 spacing steps, 8 type sizes, 4 radii — so
 * there is one shared definition here rather than twelve.
 *
 * The plugins match the CDN query string the mockups used:
 *   cdn.tailwindcss.com?plugins=forms,container-queries
 */
module.exports = {
  darkMode: "class",
  content: ["./templates/**/*.html"],
  theme: {
    extend: {
      colors: {
        "secondary-fixed": "#d8e2ff",
        "on-primary-fixed": "#410001",
        outline: "#946e69",
        "surface-container-highest": "#e0e3e5",
        "on-surface": "#181c1e",
        "surface-container-lowest": "#ffffff",
        "on-secondary-fixed-variant": "#364768",
        "primary-fixed": "#ffdad5",
        "surface-variant": "#e0e3e5",
        "tertiary-fixed": "#d8e3fa",
        error: "#ba1a1a",
        background: "#f7fafc",
        "inverse-surface": "#2d3133",
        "surface-container-high": "#e5e9eb",
        "surface-container-low": "#f1f4f6",
        "on-primary": "#ffffff",
        "tertiary-container": "#687387",
        "surface-container": "#ebeef0",
        "on-primary-container": "#fff8f7",
        primary: "#b8000d",
        "primary-container": "#e70013",
        "on-error-container": "#93000a",
        "secondary-fixed-dim": "#b6c6ef",
        "on-secondary": "#ffffff",
        "on-background": "#181c1e",
        secondary: "#4e5e81",
        "error-container": "#ffdad6",
        "primary-fixed-dim": "#ffb4aa",
        "on-tertiary-container": "#f8f9ff",
        "surface-tint": "#c0000e",
        "outline-variant": "#e9bcb6",
        "on-surface-variant": "#5f3f3b",
        "surface-dim": "#d7dadc",
        "on-tertiary-fixed-variant": "#3c475a",
        "inverse-on-surface": "#eef1f3",
        tertiary: "#4f5b6e",
        "inverse-primary": "#ffb4aa",
        surface: "#f7fafc",
        "surface-bright": "#f7fafc",
        "on-secondary-fixed": "#081b3a",
        "on-primary-fixed-variant": "#930008",
        "on-tertiary-fixed": "#111c2c",
        "tertiary-fixed-dim": "#bcc7dd",
        "on-secondary-container": "#4b5b7e",
        "on-error": "#ffffff",
        "on-tertiary": "#ffffff",
        "secondary-container": "#c4d4fd",
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem",
      },
      spacing: {
        "interpreter-slot-width": "320px",
        "container-max": "1280px",
        gutter: "24px",
        "margin-mobile": "16px",
        base: "8px",
        "margin-desktop": "40px",
      },
      fontFamily: {
        "label-md": ["Public Sans"],
        "label-sm": ["Public Sans"],
        "body-lg": ["Public Sans"],
        "display-lg-mobile": ["Public Sans"],
        "headline-md": ["Public Sans"],
        "display-lg": ["Public Sans"],
        "headline-sm": ["Public Sans"],
        "body-md": ["Public Sans"],
      },
      fontSize: {
        "label-md": [
          "14px",
          { lineHeight: "1.4", letterSpacing: "0.01em", fontWeight: "600" },
        ],
        "label-sm": ["12px", { lineHeight: "1.4", fontWeight: "500" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "display-lg-mobile": ["32px", { lineHeight: "1.2", fontWeight: "700" }],
        "headline-md": ["30px", { lineHeight: "1.3", fontWeight: "600" }],
        "display-lg": [
          "48px",
          { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        "headline-sm": ["24px", { lineHeight: "1.3", fontWeight: "600" }],
        "body-md": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/container-queries"),
  ],
};
