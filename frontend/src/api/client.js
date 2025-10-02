const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:5000';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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

export async function listAuctions({ status = 'active' } = {}) {
  const query = `?status=${encodeURIComponent(status)}`;
  return request(`/auctions${query}`);
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

export default {
  register,
  login,
  listAuctions,
  fetchAuction,
  placeBid,
};
