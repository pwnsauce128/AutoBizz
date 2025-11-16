import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envCandidates = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(process.cwd(), '.env'),
];

let loadedEnvPath = null;
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    loadedEnvPath = envPath;
    break;
  }
}
if (loadedEnvPath) {
  console.log(`Expo config: loaded environment from ${loadedEnvPath}`);
} else {
  console.log('Expo config: no .env file found; relying on process env');
}

export default ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:5000';
  console.log(`Expo config: resolved EXPO_PUBLIC_API_URL=${apiUrl}`);

  return {
    ...config,
    expo: {
      name: 'AutoBizz',
      slug: 'autobizz',
      version: '1.0.0',
      orientation: 'portrait',
      icon: './assets/icon.png',
      splash: {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
      updates: {
        fallbackToCacheTimeout: 0,
      },
      assetBundlePatterns: ['**/*'],
      ios: {
        supportsTablet: true,
      },
      android: {
        adaptiveIcon: {
          foregroundImage: './assets/adaptive-icon.png',
          backgroundColor: '#ffffff',
        },
      },
      web: {
        bundler: 'metro',
        favicon: './assets/favicon.png',
      },
      extra: {
        apiUrl,
      },
    },
  };
};
