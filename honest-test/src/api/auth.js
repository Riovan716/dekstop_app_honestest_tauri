import { apiRequest, saveAuthToken, removeAuthToken } from './client.js';

/**
 * Login user
 * @param {Object} payload - Login credentials
 * @param {string} payload.username - Username
 * @param {string} payload.password - Password
 * @returns {Promise<Object>} Response with token and user data
 */
export async function login(payload) {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: payload,
    useAuth: false,
  });

  // Save token if login successful
  if (response.data?.token) {
    await saveAuthToken(response.data.token);
  }

  return response;
}

/**
 * Register new user
 * @param {Object} payload - Registration data
 * @returns {Promise<Object>} Response data
 */
export async function register(payload) {
  const response = await apiRequest('/users', {
    method: 'POST',
    body: payload,
    useAuth: false,
  });

  return response;
}

/**
 * Logout user (remove token)
 */
export async function logout() {
  await removeAuthToken();
}

