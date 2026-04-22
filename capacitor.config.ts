import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartbusiness.app',
  appName: 'SmartBusinessApp',
  webDir: 'www',
  plugins: {
    Camera: {
      // Android: pide permisos en tiempo de ejecución automáticamente
    },
  },
};

export default config;
