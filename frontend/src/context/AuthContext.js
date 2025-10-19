import React, { createContext, useContext, useMemo, useReducer } from 'react';

const AuthContext = createContext(null);

const initialState = {
  accessToken: null,
  refreshToken: null,
  role: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      return {
        accessToken: action.payload.access,
        refreshToken: action.payload.refresh,
        role: action.payload.role
          ? String(action.payload.role).toLowerCase()
          : null,
      };
    case 'LOGOUT':
      return initialState;
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo(
    () => ({
      ...state,
      isAuthenticated: Boolean(state.accessToken),
      login(tokens, claims = {}) {
        dispatch({ type: 'LOGIN', payload: { ...tokens, ...claims } });
      },
      logout() {
        dispatch({ type: 'LOGOUT' });
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
