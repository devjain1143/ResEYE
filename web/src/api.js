let accessToken = null;
let refreshing = null;
let onCaptchaNeeded = null;

export const setCaptchaHandler = (fn) => {
  onCaptchaNeeded = fn;
};

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export async function refresh() {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) throw new Error('refresh failed');
      const data = await r.json();
      accessToken = data.accessToken;
      return data;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api(path, { method = 'GET', body, isFormData = false, retry = true } = {}) {
  const headers = {};
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  if (res.status === 401 && retry) {
    try {
      await refresh();
      return api(path, { method, body, isFormData, retry: false });
    } catch {
      accessToken = null;
    }
  }

  if (res.status === 428 && retry && onCaptchaNeeded) {
    await onCaptchaNeeded();
    return api(path, { method, body, isFormData, retry: false });
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json.message || 'Request failed');
    error.status = res.status;
    error.code = json.code;
    error.data = json;
    throw error;
  }
  return json;
}

export const bootstrapAuth = () => refresh();
