import User from '../models/User.js';
import { generateToken } from '../utils/token.js';
import { AppError } from '../middleware/errorHandler.js';
import config from '../config/env.js';

// Cookie configuration options
const getCookieOptions = () => ({
  httpOnly: true,
  secure: config.isProduction, // Secure only over HTTPS in production
  sameSite: 'none',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in ms
});

/**
 * Register a new user account
 * POST /api/v1/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // 1. Basic validation
    if (!email || !password) {
      return next(new AppError('Please provide email and password.', 400));
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return next(new AppError('Please provide a valid email address.', 400));
    }

    if (password.length < 8) {
      return next(new AppError('Password must be at least 8 characters long.', 400));
    }

    // 2. Check if user already exists
    const existingUser = await User.findOne({ email: trimmedEmail });
    if (existingUser) {
      return next(new AppError('An account with this email address already exists.', 409));
    }

    // 3. Hash password and save new user
    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      email: trimmedEmail,
      name: name?.trim() || 'Candidate',
      passwordHash
    });

    // 4. Generate JWT session token
    const token = generateToken(user);

    // 5. Set session cookie
    res.cookie('token', token, getCookieOptions());

    // 6. Return standardized JSON response
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: user.toSafeObject(),
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log in an existing user
 * POST /api/v1/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError('Please provide both email and password.', 400));
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Find user and explicitly select passwordHash for verification
    const user = await User.findOne({ email: trimmedEmail }).select('+passwordHash');
    if (!user) {
      return next(new AppError('Invalid email or password.', 401));
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return next(new AppError('Invalid email or password.', 401));
    }

    // Generate JWT session token
    const token = generateToken(user);

    // Set session cookie
    res.cookie('token', token, getCookieOptions());

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toSafeObject(),
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log out user by clearing session cookie
 * POST /api/v1/auth/logout
 */
export const logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'none'
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

/**
 * Get profile of currently authenticated user
 * GET /api/v1/auth/me
 */
export const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user
    }
  });
};

export default {
  register,
  login,
  logout,
  getMe
};
