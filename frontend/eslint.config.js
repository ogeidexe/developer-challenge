// ESLint 9 flat config: JS + TypeScript recommended rules and the React hooks rules.
// Formatting is Prettier's job (npm run format:check), so no stylistic rules here.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'cypress/screenshots', 'cypress/videos'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['cypress/**/*.{ts,mjs}', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node, ...globals.mocha } },
    // Chai assertions (`expect(x).to.exist`) are expressions by design
    rules: { '@typescript-eslint/no-unused-expressions': 'off' },
  },
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
  },
)
