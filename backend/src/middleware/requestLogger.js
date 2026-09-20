import morgan from 'morgan';
import config from '../config/env.js';

// Custom morgan format string
const logFormat = config.isProduction ? 'combined' : ':method :url :status :res[content-length] - :response-time ms';

export const requestLogger = morgan(logFormat, {
  skip: (req, _res) => {
    // Optionally skip high-frequency health checks in production logs
    if (config.isProduction && req.url === '/api/v1/health') {
      return true;
    }
    return false;
  }
});

export default requestLogger;
