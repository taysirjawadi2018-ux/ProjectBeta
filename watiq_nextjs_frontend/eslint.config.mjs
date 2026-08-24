import { FlatCompat } from '@eslint/eslintrc';

// ESLint 9 needs a flat config; eslint-config-next still ships the legacy
// format, so it goes through FlatCompat. `npm run lint` was dead before this
// file existed — ESLint refused to start without one.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: ['node_modules/**', '.next/**', 'out/**'],
  },
];

export default config;
