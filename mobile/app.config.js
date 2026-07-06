// ⚠️ DEPRECATED: this Expo app is superseded by the PWA at /m (web/src/app/m).
// It is not maintained and not built by CI. See mobile/DEPRECATED.md.
console.warn(
  '[DEPRECATED] Expo mobile app — use the PWA at /m (web/src/app/m). See mobile/DEPRECATED.md.',
);

const IS_DEV = process.env.APP_ENV !== 'production';

// Android emulator reaches Mac localhost via 10.0.2.2
// Real device on same WiFi uses your Mac's local IP
// Production uses the deployed server
const API_URL = process.env.API_URL ?? (IS_DEV ? 'http://10.0.2.2:4100/api/v1' : 'https://alertops-api.duckdns.org/api/v1');
const WS_URL  = process.env.WS_URL  ?? (IS_DEV ? 'ws://10.0.2.2:4100/ws'        : 'wss://alertops-api.duckdns.org/ws');

module.exports = {
  expo: {
    name: IS_DEV ? 'AlertOps (Dev)' : 'AlertOps',
    slug: 'alertops',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    splash: {
      backgroundColor: '#1d4ed8',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.alertops.industrial',
      infoPlist: { UIBackgroundModes: ['remote-notification'] },
    },
    android: {
      package: 'com.alertops.industrial',
      adaptiveIcon: { backgroundColor: '#1d4ed8' },
      permissions: ['RECEIVE_BOOT_COMPLETED', 'VIBRATE', 'WAKE_LOCK'],
    },
    plugins: [
      'expo-router',
      'expo-system-ui',
      ['expo-notifications', { color: '#1d4ed8', sounds: [] }],
      ['expo-build-properties', {
        android: {
          compileSdkVersion: 34,
          targetSdkVersion: 34,
          buildToolsVersion: '34.0.0',
          kotlinVersion: '1.8.10',
          extraMavenRepos: [],
        },
      }],
    ],
    experiments: { typedRoutes: true },
    scheme: 'alertops',
    extra: {
      eas: {
        projectId: 'beb22f3f-0b55-4b90-8d35-033ce5ccd9de',
      },
      apiUrl: API_URL,
      wsUrl: WS_URL,
      appEnv: IS_DEV ? 'development' : 'production',
    },
  },
};
