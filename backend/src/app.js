import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import config from './config/env.js';
import requestLogger from './middleware/requestLogger.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';
import createRateLimiter from './middleware/rateLimiter.js';

const app = express();

// Security HTTP headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }
    if (config.corsOrigin.includes('*') || config.corsOrigin.includes(origin) || config.isDevelopment) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// Cookie Parser
app.use(cookieParser());

// Request Body Parsers
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// HTTP Request Logging
app.use(requestLogger);

// Root informational endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    name: 'Trao AI Interview Prep Kit API',
    version: '1.0.0',
    phase: 'Phase 1 Foundation',
    status: 'online',
    endpoints: {
      health: '/api/v1/health',
      healthPing: '/api/v1/health/ping',
      documentation: 'https://github.com/trao-ai/interview-prep-kit'
    }
  });
});

// General API rate limiter (300 requests per minute)
const globalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'API rate limit exceeded. Please wait a minute before making more requests.',
  skip: (req) => req.path.startsWith('/health') // Never throttle health checks
});

// API Routes
app.use('/api/v1', globalApiLimiter, apiRoutes);

// Catch 404
app.use(notFound);

// Centralized Global Error Handler
app.use(errorHandler);

export default app;
