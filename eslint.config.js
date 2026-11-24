// Configuración de ESLint (Fase 4.3 / QA-MED-06) — "npm run lint"
// Errores = fallos reales (variables no definidas, código inalcanzable, etc.) y bloquean el CI.
// Advertencias = limpieza recomendada que no bloquea (variables sin usar, etc.).
import js from '@eslint/js';
import globals from 'globals';

/** Funciones globales que comparten los scripts clásicos del frontend (toast.js, nav.js, auth.js) */
const GLOBALES_FRONTEND = {
  showToast: 'readonly',
  currentUser: 'writable',
};

const REGLAS_COMUNES = {
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-console': 'off',
  'eqeqeq': ['warn', 'smart'],
  'no-var': 'warn',
  // case agrupados con líneas en blanco entre ellos son intencionales
  'no-fallthrough': ['error', { allowEmptyCase: true }],
  'prefer-const': ['warn', { destructuring: 'all' }],
  // Seguridad: prohibido ejecutar texto como código
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
};

export default [
  {
    ignores: ['node_modules/**', 'coverage/**', 'frontend/public/fonts/**', 'backend/prisma/**'],
  },
  js.configs.recommended,

  // Backend, scripts y pruebas: Node.js con módulos ES
  {
    files: ['backend/**/*.js', 'scripts/**/*.{js,mjs}', 'tests/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: REGLAS_COMUNES,
  },
  {
    files: ['*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },

  // Frontend: módulos ES (cargados con type="module")
  {
    files: [
      'frontend/public/app.js',
      'frontend/public/monitoring.js',
      'frontend/public/users.js',
      'frontend/public/js/dominios/**/*.js',
      'frontend/public/js/modules/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...GLOBALES_FRONTEND },
    },
    rules: REGLAS_COMUNES,
  },

  // Frontend: scripts clásicos (sin type="module")
  {
    files: [
      'frontend/public/toast.js',
      'frontend/public/nav.js',
      'frontend/public/auth.js',
      'frontend/public/js/csrf.js',
      'frontend/public/js/paginas/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser, ...GLOBALES_FRONTEND },
    },
    rules: REGLAS_COMUNES,
  },

  // Páginas que arrancan como módulo ES (type="module")
  {
    files: ['frontend/public/js/paginas/dependencias.js', 'frontend/public/js/paginas/login.js'],
    languageOptions: { sourceType: 'module' },
  },
];
