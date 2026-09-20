import config from '../config/env.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err, req, res, _next) => {
  let error = { ...err };
  error.message = err.message || 'Internal Server Error';
  error.statusCode = err.statusCode || 500;

  // Log error details for developers
  if (config.isDevelopment) {
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    error = new AppError(`Resource not found with id: ${err.value}`, 404);
  }

  // Handle Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = new AppError(`Duplicate value entered for ${field}. Please use another value.`, 400);
  }

  // Handle Mongoose ValidationError
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map(val => val.message);
    error = new AppError('Validation Error', 400, details);
  }

  // Handle LLM / Gemini Rate Limit & Quota Exhaustion
  if (
    err.name === 'ProviderRateLimitError' ||
    err.statusCode === 429 ||
    err.isDailyQuota === true ||
    (err.message && (
      err.message.includes('GenerateRequestsPerDay') ||
      err.message.includes('RESOURCE_EXHAUSTED') ||
      err.message.toLowerCase().includes('quota exhausted')
    ))
  ) {
    error.statusCode = 429;
    error.status = 'fail';
    if (
      err.isDailyQuota ||
      (err.message && (
        err.message.includes('GenerateRequestsPerDay') ||
        err.message.includes('RESOURCE_EXHAUSTED')
      ))
    ) {
      if (!err.message.includes('daily quota exhausted')) {
        error.message = 'Gemini API daily quota exhausted (GenerateRequestsPerDayPerProject limit reached). Please try again tomorrow, upgrade your Gemini API quota, or use the mock provider.';
      }
    }
  }

  // Standardized JSON response envelope
  const responsePayload = {
    success: false,
    status: error.status || 'error',
    message: error.message,
    ...(error.details && { details: error.details }),
    timestamp: new Date().toISOString()
  };

  if (config.isDevelopment && err.stack) {
    responsePayload.stack = err.stack;
  }

  res.status(error.statusCode).json(responsePayload);
};

export default errorHandler;
