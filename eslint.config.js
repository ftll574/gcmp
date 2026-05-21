import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Engine purity: lib/calc/** must not import from React, UI libs, or browser/DOM-only modules.
  // From /plan-eng-review Q3 — keeps the engine portable to CLI, npm package, Raycast extension.
  {
    files: ['src/lib/calc/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'Engine code (src/lib/calc/**) must be UI-free.' },
            { name: 'react-dom', message: 'Engine code (src/lib/calc/**) must be UI-free.' },
            { name: 'react-dom/client', message: 'Engine code (src/lib/calc/**) must be UI-free.' },
          ],
          patterns: [
            { group: ['react/*'], message: 'Engine code (src/lib/calc/**) must be UI-free.' },
            { group: ['../components/*', '../../components/*'], message: 'Engine code must not import UI components.' },
            { group: ['../state/*', '../../state/*'], message: 'Engine code must not import React state hooks.' },
          ],
        },
      ],
    },
  },
])
