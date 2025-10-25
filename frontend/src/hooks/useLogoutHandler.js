import { useCallback } from 'react';
import { resetToLogin } from '../navigation/navigationRef';

export default function useLogoutHandler(logout) {
  return useCallback(() => {
    logout();
    resetToLogin();
  }, [logout]);
}
