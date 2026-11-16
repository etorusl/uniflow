/* eslint-disable @typescript-eslint/no-require-imports -- Expo loads this config as CommonJS. */
const { resolve } = require('node:path');

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: resolve(process.env.GOOGLE_SERVICES_JSON) }
      : {}),
  },
  plugins: [
    ...config.plugins,
    ['expo-notifications', { defaultChannel: 'deadlines' }],
    './plugins/with-local-android-release.js',
  ],
});
