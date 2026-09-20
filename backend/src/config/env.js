import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/trao_prep_kit',
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : ['http://localhost:3000'],
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'trao-ai-interview-prep-kit-jwt-secret-key-development-32chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  llmProvider: process.env.LLM_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : (process.env.OPENAI_API_KEY ? 'openai' : (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock'))),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  llmModel: process.env.LLM_MODEL || '',
  llmTemperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.2
};

// Validate critical configurations
function validateEnv() {
  const errors = [];

  if (isNaN(config.port) || config.port <= 0 || config.port > 65535) {
    errors.push(`Invalid PORT specified: "${process.env.PORT}". Must be a valid port number between 1 and 65535.`);
  }

  if (!config.mongodbUri || !config.mongodbUri.startsWith('mongodb')) {
    errors.push(`Invalid MONGODB_URI: "${config.mongodbUri}". Must start with mongodb:// or mongodb+srv://`);
  }

  if (errors.length > 0) {
    console.error('Environment Configuration Error(s):');
    errors.forEach(err => console.error(`  - ${err}`));
    if (config.isProduction) {
      process.exit(1);
    }
  }
}

validateEnv();

export default config;
