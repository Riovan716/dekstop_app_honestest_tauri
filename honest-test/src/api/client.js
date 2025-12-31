/**
 * API Client for Desktop App
 * Handles communication with Rust backend server
 */

/**
 * Get API base URL from environment variable or default
 * @returns {string} API base URL without trailing slash
 */
function getApiBaseUrl() {
  // Try to get from environment variable first
  const apiUrl = import.meta.env.VITE_API_URL;

  if (apiUrl) {
    return apiUrl.replace(/\/$/, '');
  }

  // Default to localhost:3000 (backend default port)
  return 'http://localhost:3000';
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * Get authentication token from Tauri store
 * @returns {Promise<string | null>} JWT token or null
 */
export async function getAuthToken() {
  try {
    const { load } = await import('@tauri-apps/plugin-store');
    const store = await load('store.json');
    const tokenData = await store.get('auth-token');
    return tokenData || null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Save authentication token to Tauri store
 * @param {string} token - JWT token
 */
export async function saveAuthToken(token) {
  try {
    const { load } = await import('@tauri-apps/plugin-store');
    const store = await load('store.json');
    await store.set('auth-token', token);
    await store.save();
  } catch (error) {
    console.error('Error saving auth token:', error);
  }
}

/**
 * Remove authentication token from Tauri store
 */
export async function removeAuthToken() {
  try {
    const { load } = await import('@tauri-apps/plugin-store');
    const store = await load('store.json');
    await store.delete('auth-token');
    await store.save();
  } catch (error) {
    console.error('Error removing auth token:', error);
  }
}

/**
 * Get authentication headers
 * @returns {Promise<Object>} Headers object with Authorization token if available
 */
export async function getAuthHeaders() {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Make API request with automatic auth headers
 * @param {string} path - API endpoint path
 * @param {Object} options - Request options
 * @param {string} [options.method='GET'] - HTTP method
 * @param {Object} [options.headers={}] - Additional headers
 * @param {any} [options.body] - Request body
 * @param {boolean} [options.useAuth=true] - Whether to include auth headers
 * @param {boolean} [options.isFormData=false] - Whether body is FormData (don't set Content-Type)
 * @returns {Promise<any>} Response data
 */
export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    useAuth = true,
    isFormData = false,
  } = options;

  const authHeaders = useAuth ? await getAuthHeaders() : {};

  const config = {
    method,
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...authHeaders,
      ...headers,
    },
  };

  if (body !== undefined) {
    if (isFormData || body instanceof FormData) {
      config.body = body;
    } else {
      config.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
  }

  console.log(`API Request: ${method} ${API_BASE_URL}${path}`);
  
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, config);
  } catch (fetchError) {
    console.error('Fetch error:', fetchError);
    throw new Error(`Network error: ${fetchError.message || 'Failed to connect to server'}`);
  }

  let payload = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      const text = await response.text();
      if (text) {
        payload = JSON.parse(text);
      }
    } catch (parseError) {
      console.warn('Failed to parse response as JSON:', parseError);
      // If response is not JSON, payload remains null
    }
  } else {
    // If not JSON, try to read as text
    try {
      const text = await response.text();
      if (text) {
        console.warn('Response is not JSON:', text.substring(0, 100));
      }
    } catch (e) {
      console.warn('Failed to read response text:', e);
    }
  }

  if (!response.ok) {
    const message = payload?.error ?? `Request failed (${response.status} ${response.statusText})`;
    console.error('API Error:', {
      status: response.status,
      statusText: response.statusText,
      message,
      payload,
    });
    throw new Error(message);
  }

  return payload;
}

/**
 * Make API request with fetch (for cases where apiRequest doesn't fit)
 * @param {string} path - API endpoint path
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function apiFetch(path, options = {}) {
  const { useAuth = true, ...restOptions } = options;
  const authHeaders = useAuth ? await getAuthHeaders() : {};

  const config = {
    ...restOptions,
    headers: {
      ...authHeaders,
      ...(restOptions.headers || {}),
    },
  };

  return fetch(`${API_BASE_URL}${path}`, config);
}

