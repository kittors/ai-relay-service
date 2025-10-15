module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es2021: true
  },
  extends: [
    'plugin:vue/vue3-strongly-recommended',
    'eslint:recommended',
    'plugin:prettier/recommended'
  ],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 'latest'
  },
  plugins: ['prettier'],
  rules: {
    'vue/multi-word-component-names': 'off',
    'vue/no-v-html': 'off',
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    // Disable Prettier errors inside ESLint to avoid stylistic noise
    'prettier/prettier': 'off',

    // Do not enforce Vue attribute ordering in templates
    'vue/attributes-order': 'off',

    // Do not report unused variables/imports in SPA code
    'no-unused-vars': 'off'
  }
}
