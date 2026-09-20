import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import config from '../src/config/env.js';
import { generateToken, verifyToken } from '../src/utils/token.js';
import User from '../src/models/User.js';
import PrepKit from '../src/models/PrepKit.js';
import { requireAuth } from '../src/middleware/auth.js';
import { register, login, logout, getMe } from '../src/controllers/authController.js';
import { getKitById, getMyKits } from '../src/controllers/kitController.js';

describe('Authentication & Session Architecture Tests', () => {

  // Mock Database Store for Unit/Integration Isolation
  let userStore = [];
  let kitStore = [];

  beforeEach(() => {
    userStore = [];
    kitStore = [];

    // Mock User Model static and query methods
    User.findOne = (query) => {
      const email = query.email;
      const user = userStore.find(u => u.email === email) || null;
      const queryPromise = Promise.resolve(user);
      queryPromise.select = () => Promise.resolve(user);
      return queryPromise;
    };

    User.findById = (id) => {
      const user = userStore.find(u => u._id.toString() === id.toString());
      return {
        select: (_fields) => Promise.resolve(user || null)
      };
    };

    User.create = async (userData) => {
      const newUser = {
        _id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        email: userData.email,
        name: userData.name,
        passwordHash: userData.passwordHash,
        comparePassword: async function (candidatePassword) {
          const bcrypt = await import('bcryptjs');
          return bcrypt.default.compare(candidatePassword, this.passwordHash);
        },
        toSafeObject: function () {
          return {
            id: this._id.toString(),
            email: this.email,
            name: this.name
          };
        }
      };
      userStore.push(newUser);
      return newUser;
    };

    // Mock PrepKit Model query methods
    PrepKit.findById = (id) => {
      const kit = kitStore.find(k => k._id.toString() === id.toString());
      return Promise.resolve(kit || null);
    };

    PrepKit.find = (query) => {
      let filtered = [...kitStore];
      if (query.userId) {
        filtered = filtered.filter(k => k.userId.toString() === query.userId.toString());
      }
      return {
        select: () => ({
          sort: () => Promise.resolve(filtered)
        })
      };
    };
  });

  // Test 1: Password Hashing
  test('Password hashing produces secure, non-reversible bcrypt hash', async () => {
    const rawPassword = 'SuperSecretPassword123!';
    const hash = await User.hashPassword(rawPassword);

    assert.notEqual(hash, rawPassword);
    assert.match(hash, /^\$2[aby]\$12\$/); // Valid bcrypt hash with work factor 12
  });

  // Test 2: Registration
  test('Registration creates new user, hashes password, sets cookie, and returns JWT', async () => {
    let statusCode = null;
    let jsonResponse = null;
    let cookieSet = null;

    const req = {
      body: {
        email: 'candidate@trao.ai',
        password: 'Password123!',
        name: 'Alex Developer'
      }
    };

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      cookie(name, val, opts) {
        cookieSet = { name, val, opts };
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    await register(req, res, (err) => { if (err) throw err; });

    assert.equal(statusCode, 201);
    assert.equal(jsonResponse.success, true);
    assert.equal(jsonResponse.data.user.email, 'candidate@trao.ai');
    assert.ok(jsonResponse.data.token);
    assert.equal(cookieSet.name, 'token');
    assert.equal(cookieSet.opts.httpOnly, true);

    // Verify token can be decoded
    const decoded = verifyToken(jsonResponse.data.token);
    assert.equal(decoded.email, 'candidate@trao.ai');
  });

  // Test 3: Login with valid credentials
  test('Login succeeds with valid credentials and sets session cookie', async () => {
    // Register user first
    const passwordHash = await User.hashPassword('CorrectPassword123');
    userStore.push({
      _id: 'user_123',
      email: 'user@trao.ai',
      name: 'Test User',
      passwordHash,
      comparePassword: async function (candidate) {
        const bcrypt = await import('bcryptjs');
        return bcrypt.default.compare(candidate, this.passwordHash);
      },
      toSafeObject: function () {
        return { id: this._id, email: this.email, name: this.name };
      }
    });

    let statusCode = null;
    let jsonResponse = null;
    let cookieSet = null;

    const req = {
      body: {
        email: 'user@trao.ai',
        password: 'CorrectPassword123'
      }
    };

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      cookie(name, val, opts) {
        cookieSet = { name, val, opts };
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    await login(req, res, (err) => { if (err) throw err; });

    assert.equal(statusCode, 200);
    assert.equal(jsonResponse.success, true);
    assert.equal(jsonResponse.data.user.email, 'user@trao.ai');
    assert.ok(jsonResponse.data.token);
    assert.equal(cookieSet.name, 'token');
  });

  // Test 4: Invalid credentials (wrong password)
  test('Login fails with 401 Unauthorized on invalid credentials', async () => {
    const passwordHash = await User.hashPassword('RealPassword123');
    userStore.push({
      _id: 'user_123',
      email: 'user@trao.ai',
      name: 'Test User',
      passwordHash,
      comparePassword: async function (candidate) {
        const bcrypt = await import('bcryptjs');
        return bcrypt.default.compare(candidate, this.passwordHash);
      }
    });

    let errorPassed = null;
    const req = {
      body: {
        email: 'user@trao.ai',
        password: 'WrongPassword456'
      }
    };
    const res = {};

    await login(req, res, (err) => {
      errorPassed = err;
    });

    assert.ok(errorPassed);
    assert.equal(errorPassed.statusCode, 401);
    assert.equal(errorPassed.message, 'Invalid email or password.');
  });

  // Test 5: Protected endpoint without token returns 401
  test('Protected endpoint rejects unauthenticated request with 401', async () => {
    let errorPassed = null;
    const req = {
      cookies: {},
      headers: {}
    };
    const res = {};

    await requireAuth(req, res, (err) => {
      errorPassed = err;
    });

    assert.ok(errorPassed);
    assert.equal(errorPassed.statusCode, 401);
    assert.match(errorPassed.message, /Authentication required/i);
  });

  // Test 6: Invalid / Expired Token Handling
  test('Protected endpoint rejects expired or tampered token with 401', async () => {
    // Tampered token
    let errorPassed = null;
    const req = {
      cookies: {},
      headers: { authorization: 'Bearer this.is.a.tampered.token' }
    };
    const res = {};

    await requireAuth(req, res, (err) => {
      errorPassed = err;
    });

    assert.ok(errorPassed);
    assert.equal(errorPassed.statusCode, 401);
    assert.equal(errorPassed.details, 'TOKEN_INVALID');

    // Expired token
    const expiredToken = jwt.sign(
      { id: 'user_999', email: 'expired@trao.ai' },
      config.jwtSecret,
      { expiresIn: '-1s' } // Expired 1 second ago
    );

    let expiredError = null;
    const reqExpired = {
      cookies: { token: expiredToken },
      headers: {}
    };

    await requireAuth(reqExpired, res, (err) => {
      expiredError = err;
    });

    assert.ok(expiredError);
    assert.equal(expiredError.statusCode, 401);
    assert.equal(expiredError.details, 'TOKEN_EXPIRED');
  });

  // Test 7: User Isolation — User A cannot access User B's kit
  test('User Isolation: User A cannot access User B\'s kit, and lists are strictly partitioned', async () => {
    const userA = { _id: 'user_A_id', email: 'userA@trao.ai', name: 'User A' };
    const userB = { _id: 'user_B_id', email: 'userB@trao.ai', name: 'User B' };
    userStore.push(userA, userB);

    // Create Kit owned by User A
    const kitA = {
      _id: 'kit_A_1001',
      userId: userA._id,
      targetRole: 'Senior SDE',
      targetCompany: 'Google',
      jobDescriptionRaw: 'Distributed systems and algorithms'
    };
    kitStore.push(kitA);

    // User A requests their own kit -> 200 OK
    let userAResponse = null;
    const reqUserA = {
      params: { id: 'kit_A_1001' },
      user: { id: userA._id }
    };
    const resUserA = {
      status(code) { assert.equal(code, 200); return this; },
      json(data) { userAResponse = data; return this; }
    };
    await getKitById(reqUserA, resUserA, (err) => { if (err) throw err; });
    assert.ok(userAResponse.data.kit);
    assert.equal(userAResponse.data.kit._id, 'kit_A_1001');

    // User B attempts to access User A's kit -> 403 Forbidden!
    let forbiddenError = null;
    const reqUserB = {
      params: { id: 'kit_A_1001' },
      user: { id: userB._id } // Authenticated as User B!
    };
    const resUserB = {};

    await getKitById(reqUserB, resUserB, (err) => {
      forbiddenError = err;
    });

    assert.ok(forbiddenError, 'User B must be rejected when requesting User A\'s kit');
    assert.equal(forbiddenError.statusCode, 403);
    assert.match(forbiddenError.message, /Access denied/i);

    // Verify User B's kit listing query returns 0 kits
    let userBListResponse = null;
    const reqUserBList = {
      user: { id: userB._id }
    };
    const resUserBList = {
      status(code) { assert.equal(code, 200); return this; },
      json(data) { userBListResponse = data; return this; }
    };
    await getMyKits(reqUserBList, resUserBList, (err) => { if (err) throw err; });
    assert.equal(userBListResponse.count, 0);
    assert.equal(userBListResponse.data.kits.length, 0);
  });

  // Test 8: Logout clears session cookie
  test('Logout clears session cookie', () => {
    let clearedCookie = null;
    let jsonResponse = null;

    const req = {};
    const res = {
      clearCookie(name, opts) {
        clearedCookie = { name, opts };
        return this;
      },
      status(code) {
        assert.equal(code, 200);
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    logout(req, res);

    assert.equal(clearedCookie.name, 'token');
    assert.equal(clearedCookie.opts.httpOnly, true);
    assert.equal(jsonResponse.success, true);
    assert.match(jsonResponse.message, /Logged out successfully/i);
  });
});
