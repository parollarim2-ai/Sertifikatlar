/**
 * Provides authenticated HTTP request headers for administrator endpoints.
 */
export function getAdminAuthHeaders(): Record<string, string> {
  let token = '';
  try {
    token = localStorage.getItem('b1m_admin_token') || '';
  } catch {
    token = '';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-admin-token'] = token;
  }

  return headers;
}
