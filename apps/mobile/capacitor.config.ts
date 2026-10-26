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
      // The artwork is a small mark in the middle of a square, drawn in light and in dark (apps/mobile/assets). Cropping
      // it to fill the screen leaves no border, so there is no fixed colour to clash with the dark one, and the plugin's
      // own backgroundColor is left unset.
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
  ios: {
    // Keep the page out of the notch and the home bar without any change to the web app's styles.
    contentInset: 'always',
  },
};

export default config;
