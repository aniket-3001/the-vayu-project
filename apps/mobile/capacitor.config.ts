import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vayu.app',
  appName: 'Vayu',
  webDir: 'www',
  server: {
    // The app is served from https://localhost on Android; iOS uses capacitor://localhost.
    androidScheme: 'https',
  },
  ios: {
    // Keep the page out of the notch and the home bar without any change to the web app's styles.
    contentInset: 'always',
  },
};

export default config;
