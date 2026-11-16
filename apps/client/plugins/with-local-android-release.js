/* eslint-disable @typescript-eslint/no-require-imports -- Expo config plugins load this file as CommonJS. */
const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { AndroidConfig, withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

const signingConfig = `        localRelease {
            if (System.getenv('UNIFLOW_RELEASE_KEYSTORE')) {
                storeFile file(System.getenv('UNIFLOW_RELEASE_KEYSTORE'))
                storePassword System.getenv('UNIFLOW_RELEASE_PASSWORD')
                keyAlias 'uniflow-local'
                keyPassword System.getenv('UNIFLOW_RELEASE_PASSWORD')
            }
        }
`;

module.exports = function withLocalAndroidRelease(config) {
  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:networkSecurityConfig'] = '@xml/uniflow_network_security';
    return mod;
  });
  config = withAppBuildGradle(config, async (mod) => {
    const xml = join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await mkdir(xml, { recursive: true });
    await writeFile(
      join(xml, 'uniflow_network_security.xml'),
      `<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>\n`,
    );
    let contents = mod.modResults.contents;
    if (!contents.includes('signingConfig signingConfigs.localRelease')) {
      const release =
        /(^\s*release \{\n(?:[^\n]*\n){0,4}?)[ \t]*signingConfig signingConfigs\.debug/m;
      if (mod.modResults.language !== 'groovy' || !release.test(contents))
        throw new Error(
          'The Expo Android release template changed. Update the UniFlow config plugin.',
        );
      contents = contents
        .replace('    signingConfigs {\n', `    signingConfigs {\n${signingConfig}`)
        .replace(
          release,
          '$1            applicationIdSuffix ".local"\n            signingConfig signingConfigs.localRelease',
        );
    }
    mod.modResults.contents = contents;
    return mod;
  });
  return config;
};
