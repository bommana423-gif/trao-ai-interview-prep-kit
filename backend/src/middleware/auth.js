import { verifyToken } from '../utils/token.js';
import { AppError } from './errorHandler.js';
import User from '../models/User.js';

export const requireAuth = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check HTTP-only cookie first
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    // 2. Fall back to Authorization: Bearer <token> header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Authentication required. Please log in to access this resource.', 401));
    }

    // 3. Verify JWT token signature and expiration
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new AppError('Session has expired. Please log in again.', 401, 'TOKEN_EXPIRED'));
      }
      return next(new AppError('Invalid authentication token.', 401, 'TOKEN_INVALID'));
    }

    // 4. Verify user still exists in database
    const currentUser = await User.findById(decoded.id).select('_id email name');
    if (!currentUser) {
      return next(new AppError('The user account belonging to this session no longer exists.', 401));
    }

    // 5. Attach authenticated user object to request
    req.user = {
      id: currentUser._id.toString(),
      email: currentUser.email,
      name: currentUser.name
    };

    next();
  } catch (error) {
    next(error);
  }
};

export default requireAuth;
