import type { CapacitorConfig } from '@capacitor/cli';

// Android app wrapper. The same web code runs inside it; native features (Health Connect,
// notifications, sharing files) are added through plugins.
const config: CapacitorConfig = {
  appId: 'io.github.decystewart99sys.coach',
  appName: 'Coach',
  webDir: 'dist',
  android: {
    // Phone back button and status bar behave like a normal app.
    backgroundColor: '#0f1115',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_coach',
      iconColor: '#3ddc97',
    },
  },
};

export default config;
