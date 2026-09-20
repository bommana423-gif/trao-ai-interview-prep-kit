import { getDBStatus } from '../config/db.js';
import config from '../config/env.js';

export const getHealth = (req, res) => {
  const dbStatus = getDBStatus();
  const uptimeSeconds = Math.floor(process.uptime());
  const memoryUsage = process.memoryUsage();

  const isDegraded = !dbStatus.isConnected;

  const healthData = {
    status: isDegraded ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    service: {
      name: 'trao-prep-kit-backend',
      version: '1.0.0',
      environment: config.nodeEnv,
      nodeVersion: process.version
    },
    system: {
      uptimeSeconds,
      memory: {
        rssMb: Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100,
        heapTotalMb: Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100,
        heapUsedMb: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100
      }
    },
    database: {
      provider: 'mongodb',
      ...dbStatus
    }
  };

  const httpStatus = isDegraded ? 200 : 200; // Returns 200 with degraded note for container health probes
  res.status(httpStatus).json({
    success: true,
    data: healthData
  });
};

export const getPing = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString()
  });
};

export default {
  getHealth,
  getPing
};
