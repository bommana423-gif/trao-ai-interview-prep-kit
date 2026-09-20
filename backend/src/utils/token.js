import jwt from 'jsonwebtoken';
import config from '../config/env.js';

/**
 * Sign a new JWT session token for an authenticated user
 */
export const generateToken = (user) => {
  const payload = {
    id: user._id ? user._id.toString() : user.id,
    email: user.email
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
};

/**
 * Verify and decode a JWT session token
 * Throws JsonWebTokenError or TokenExpiredError on invalid/expired tokens
 */
export const verifyToken = (token) => {
  return jwt.verify(token, config.jwtSecret);
};

export default {
  generateToken,
  verifyToken
};
