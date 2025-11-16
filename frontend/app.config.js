import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envCandidates = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(process.cwd(), '.env'),
];

let loadedEnvPath = null;
let loadedEnvVars = null;

for (const envPath of envCandidates) {
  if (!fs.existsSync(envPath)) continue;

  const contents = fs.readFileSync(envPath);
  loadedEnvVars = dotenv.parse(contents);
  for (const [key, value] of Object.entries(loadedEnvVars)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  loadedEnvPath = envPath;
  break;
}

if (loadedEnvPath) {
  const loggedValue = loadedEnvVars?.EXPO_PUBLIC_API_URL ?? 'undefined';
  console.log(
    `Expo config: loaded environment from ${loadedEnvPath} (EXPO_PUBLIC_API_URL=${loggedValue})`,
  );
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
