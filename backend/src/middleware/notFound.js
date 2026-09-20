export const notFound = (req, res, _next) => {
  res.status(404).json({
    success: false,
    status: 'fail',
    message: `API Route not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
};

export default notFound;
