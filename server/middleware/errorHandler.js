export const notFoundHandler = (req, res) => {
  res.status(404).json({ ok: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
};

export const errorHandler = (error, req, res, _next) => {
  console.error('Unhandled server error:', error);
  res.status(500).json({
    ok: false,
    error: 'Internal server error',
    message: error?.message || 'Unknown error',
  });
};

