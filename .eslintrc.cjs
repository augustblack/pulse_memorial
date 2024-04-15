module.exports = {
  extends: ['@hono/eslint-config'],
  overrides: [
    {
      'files': ['assets/**/*.js'],
      'env': {
        'browser': true,
        'es6': true
      },
      'extends': [
        'eslint:recommended'
      ],
      'globals': {
        'Janus': 'readonly'
      }
    }
  ]
}
