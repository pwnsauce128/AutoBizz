import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || Constants.manifest?.extra;
const BASE_URL = extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:5000';

async function request(path, { method = 'GET', body, token, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = errorText;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.message || parsed.error || errorText;
    } catch (error) {
      // ignore parse failure and fall back to raw text
    }
    const err = new Error(message || response.statusText);
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function register({ username, email, password }) {
  return request('/auth/register', {
    method: 'POST',
    body: { username, email, password },
  });
}

export async function login({ usernameOrEmail, password }) {
  return request('/auth/login', {
    method: 'POST',
    body: { usernameOrEmail, password },
  });
}

export async function registerDevice(expoPushToken, token) {
  return request('/devices', {
    method: 'POST',
    token,
    body: { expo_push_token: expoPushToken },
  });
}

export async function listAuctions(
  {
    status = 'active',
    sort = 'fresh',
    scope,
    createdAfter,
    token,
  } = {},
  { signal } = {},
) {
  const params = new URLSearchParams();
  if (status) {
    params.append('status', status);
  }
  if (sort) {
    params.append('sort', sort);
  }
  if (scope) {
    params.append('scope', scope);
  }
  if (createdAfter) {
    params.append('created_after', createdAfter);
  }
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return request(`/auctions${suffix}`, { token, signal });
}

export async function fetchAuction(auctionId) {
  return request(`/auctions/${auctionId}`);
}

export async function placeBid(auctionId, amount, token) {
  return request(`/auctions/${auctionId}/bids`, {
    method: 'POST',
    token,
    body: { amount },
  });
}

export async function createAuction(data, token) {
  return request('/auctions', {
    method: 'POST',
    token,
    body: data,
  });
}

export async function listMyAuctions({ status = 'all' } = {}, token) {
  const params = new URLSearchParams();
  if (status) {
    params.append('status', status);
  }
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return request(`/auctions/mine${suffix}`, { token });
}

export async function listManageAuctions({ status = 'all', createdFrom, createdTo } = {}, token) {
  const params = new URLSearchParams();
  if (status) {
    params.append('status', status);
  }
  if (createdFrom) {
    const value =
      createdFrom instanceof Date ? createdFrom.toISOString() : new Date(createdFrom).toISOString();
    params.append('created_from', value);
  }
  if (createdTo) {
    const value = createdTo instanceof Date ? createdTo.toISOString() : new Date(createdTo).toISOString();
    params.append('created_to', value);
  }
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return request(`/auctions/manage${suffix}`, { token });
}

export async function exportManageAuctionsCSV(
  { status = 'all', createdFrom, createdTo } = {},
  token,
) {
  const params = new URLSearchParams();
  if (status) {
    params.append('status', status);
  }
  if (createdFrom) {
    const value =
      createdFrom instanceof Date ? createdFrom.toISOString() : new Date(createdFrom).toISOString();
    params.append('created_from', value);
  }
  if (createdTo) {
    const value = createdTo instanceof Date ? createdTo.toISOString() : new Date(createdTo).toISOString();
    params.append('created_to', value);
  }
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${BASE_URL}/auctions/manage/export${suffix}`, {
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = errorText;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.message || parsed.error || errorText;
    } catch (error) {
      // ignore JSON parse failures for CSV responses
    }
    const err = new Error(message || response.statusText);
    err.status = response.status;
    throw err;
  }

  return response.text();
}

export async function updateAuction(auctionId, data, token) {
  return request(`/auctions/${auctionId}`, {
    method: 'PATCH',
    token,
    body: data,
  });
}

export async function deleteAuction(auctionId, token) {
  return request(`/auctions/${auctionId}`, {
    method: 'DELETE',
    token,
  });
}

export async function listUsers(token) {
  return request('/admin/users', { token });
}

export async function createUser(data, token) {
  return request('/admin/users', {
    method: 'POST',
    token,
    body: data,
  });
}

export async function updateUser(userId, data, token) {
  return request(`/admin/users/${userId}`, {
    method: 'PATCH',
    token,
    body: data,
  });
}

export default {
  register,
  login,
  listAuctions,
  fetchAuction,
  placeBid,
  createAuction,
  listMyAuctions,
  listManageAuctions,
  updateAuction,
  deleteAuction,
  listUsers,
  createUser,
  updateUser,
  registerDevice,
};
