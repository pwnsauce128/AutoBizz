const projectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
  process.env.EAS_PROJECT_ID ??
  process.env.EXPO_PROJECT_ID ??
  null;

module.exports = () => ({
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
      eas: {
        projectId,
      },
    },
  },
});
