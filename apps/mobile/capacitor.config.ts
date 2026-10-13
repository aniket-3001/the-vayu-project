import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vayu.app',
  appName: 'Vayu',
  webDir: 'www',
  server: {
    // The app is served from https://localhost on Android; iOS uses capacitor://localhost.
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      // The app takes the startup screen down itself, once it has drawn (see apps/web/src/native/splash.ts).
      launchAutoHide: false,
      backgroundColor: '#F4F6F8',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
  },
  ios: {
    // Keep the page out of the notch and the home bar without any change to the web app's styles.
    contentInset: 'always',
  },
};

export default config;
