export function notFound(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`
  });
}

export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server anomaly.';
  const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : undefined);

  if (status >= 500) {
    console.error('[Server Error]', err);
  }

  res.status(status).json({
    success: false,
    message,
    ...(code && { code }),
    ...(process.env.NODE_ENV !== 'production' && status >= 500 && { stack: err.stack })
  });
}
