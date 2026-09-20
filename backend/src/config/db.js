import mongoose from 'mongoose';
import config from './env.js';

let isConnected = false;

export const connectDB = async (retryCount = 0, maxRetries = 5) => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const options = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 2
  };

  try {
    const conn = await mongoose.connect(config.mongodbUri, options);
    isConnected = true;
    console.info(`[MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
    return conn.connection;
  } catch (error) {
    isConnected = false;
    console.error(`[MongoDB] Connection error (attempt ${retryCount + 1}/${maxRetries}): ${error.message}`);

    if (retryCount < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      console.info(`[MongoDB] Retrying connection in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return connectDB(retryCount + 1, maxRetries);
    } else {
      console.warn('[MongoDB] Max connection retries reached. Server running with degraded database state.');
      // Don't crash immediately in dev to allow health checks to report DB status
      if (config.isProduction) {
        throw error;
      }
      return null;
    }
  }
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.info('[MongoDB] Connection closed.');
  }
};

export const getDBStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  const stateCode = mongoose.connection.readyState;
  return {
    stateCode,
    status: states[stateCode] || 'unknown',
    isConnected: stateCode === 1,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
};

// Listen to Mongoose connection events
mongoose.connection.on('connected', () => {
  isConnected = true;
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('[MongoDB] Disconnected from database.');
});

mongoose.connection.on('error', (err) => {
  console.error(`[MongoDB] Runtime error: ${err.message}`);
});

export default {
  connectDB,
  disconnectDB,
  getDBStatus
};
