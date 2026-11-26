import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.luminaread.app',
  appName: 'LuminaRead 流光精读',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    backgroundColor: '#050816',
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
