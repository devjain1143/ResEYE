export function originCheck(req, res, next) {
  // Safe HTTP methods skip origin checking
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Allow same-origin or localhost in development
  const origin = req.get('origin');
  const host = req.get('host');

  if (!origin) {
    // In dev or some browser forms without origin, referer can be checked
    const referer = req.get('referer');
    if (referer) {
      try {
        const refUrl = new URL(referer);
        if (refUrl.host === host) return next();
      } catch {
        // invalid URL
      }
    }
    // In production without origin/referer on state-changing request, reject
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Missing request origin.' });
    }
    return next();
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.host === host) {
      return next();
    }

    const allowedOrigin = process.env.ALLOWED_ORIGIN;
    if (allowedOrigin && origin === allowedOrigin) {
      return next();
    }

    if (process.env.NODE_ENV !== 'production') {
      // Allow localhost dev servers (e.g. Vite on 5173 talking to backend on 5000)
      if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
        return next();
      }
    }
  } catch {
    return res.status(403).json({ success: false, message: 'Invalid origin header.' });
  }

  return res.status(403).json({ success: false, message: 'Cross-origin request rejected.' });
}
