import app from './app.js';
import config from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';

let server;

async function startServer() {
  try {
    // Start Express server immediately so health probes are responsive
    server = app.listen(config.port, () => {
      console.info('====================================================');
      console.info(`  Trao AI Interview Prep Kit API Server (Phase 1)   `);
      console.info(`  Mode:        ${config.nodeEnv}`);
      console.info(`  Port:        ${config.port}`);
      console.info(`  Health:      http://localhost:${config.port}/api/v1/health`);
      console.info(`  Ping:        http://localhost:${config.port}/api/v1/health/ping`);
      console.info('====================================================');
    });

    // Initialize MongoDB connection asynchronously in background
    connectDB().catch((err) => {
      console.warn(`[MongoDB] Initial connection error: ${err.message}`);
    });
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// Graceful Shutdown Handler
async function gracefulShutdown(signal) {
  console.info(`\n[Server] ${signal} signal received. Initiating graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.info('[Server] HTTP server closed.');
      try {
        await disconnectDB();
        console.info('[Server] Graceful shutdown completed cleanly.');
        process.exit(0);
      } catch (err) {
        console.error(`[Server] Error during database disconnect: ${err.message}`);
        process.exit(1);
      }
    });

    // Force close after 10 seconds timeout
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

// Process signal listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Uncaught Exceptions & Unhandled Rejections
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, _promise) => {
  console.error('[Process] Unhandled Rejection at:', reason);
});

startServer();
