export function requireRecentLogin(maxAgeSec = 600) {
  return (req, res, next) => {
    const t = req.user?.authTime;
    if (!t || Date.now() / 1000 - t > maxAgeSec) {
      return res.status(401).json({ code: 'REAUTH_REQUIRED', message: 'Re-authentication required' });
    }
    next();
  };
}
