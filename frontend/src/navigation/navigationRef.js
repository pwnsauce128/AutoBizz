import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function resetToLogin() {
  if (!navigationRef.isReady()) {
    return;
  }

  navigationRef.resetRoot({
    index: 0,
    routes: [{ name: 'Login' }],
  });
}
