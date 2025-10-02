import { decode as atob } from 'base-64';

export function parseJwt(token) {
  if (!token) {
    return null;
  }

  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) {
      return null;
    }
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = atob(base64);
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
}
