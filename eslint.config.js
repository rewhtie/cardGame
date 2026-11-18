import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'src-tauri/target', 'src-tauri/gen', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'vue/multi-word-component-names': ['error', { ignores: ['Emoji'] }],
    },
  },
  {
    // 类型（如 Keyframe）由 vue-tsc 检查，no-undef 不认识 TS 全局类型
    files: ['**/*.ts', '**/*.vue'],
    rules: { 'no-undef': 'off' },
  },
  {
    // 引擎必须保持纯 TS，禁止依赖 UI / 桌面壳
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['vue', 'vue/*', '@vue/*'], message: 'engine 不能依赖 Vue' },
            { group: ['@tauri-apps/*'], message: 'engine 不能依赖 Tauri' },
            { group: ['@/ui/*', '@/composables/*'], message: 'engine 不能依赖 UI 层' },
          ],
        },
      ],
    },
  },
  prettier,
)
