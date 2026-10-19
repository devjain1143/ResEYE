export const requireRole = (role) => (req, res, next) => {
  if (req.user?.role === role) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Access forbidden: administrative privileges required.'
  });
};
