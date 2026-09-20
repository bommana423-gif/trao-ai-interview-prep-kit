import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createRateLimiter } from '../src/middleware/rateLimiter.js';

describe('In-Memory Sliding Window Rate Limiter Middleware', () => {
  function createMockReqRes(ip = '127.0.0.1') {
    const headers = {};
    const req = {
      ip,
      headers: {},
      socket: { remoteAddress: ip }
    };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      }
    };
    return { req, res };
  }

  it('permits requests under the configured threshold', () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 3
    });

    let calls = 0;
    const next = (err) => {
      if (!err) calls++;
    };

    const { req, res } = createMockReqRes('192.168.1.10');

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    assert.strictEqual(calls, 3, 'All 3 requests should pass');
    assert.strictEqual(res.headers['X-RateLimit-Limit'], 3);
  });

  it('rejects requests exceeding threshold with HTTP 429 and Retry-After header', () => {
    const limiter = createRateLimiter({
      windowMs: 5000,
      max: 2,
      message: 'Rate limit hit'
    });

    let passed = 0;
    let errorCaught = null;

    const next = (err) => {
      if (err) {
        errorCaught = err;
      } else {
        passed++;
      }
    };

    const { req, res } = createMockReqRes('10.0.0.5');

    limiter(req, res, next);
    limiter(req, res, next);
    assert.strictEqual(passed, 2);

    // 3rd call exceeds max 2
    limiter(req, res, next);
    assert.ok(errorCaught, 'Should pass AppError to next()');
    assert.strictEqual(errorCaught.statusCode, 429);
    assert.strictEqual(errorCaught.message, 'Rate limit hit');
    assert.ok(res.headers['Retry-After'] >= 1, 'Retry-After header must be set');
    assert.strictEqual(res.headers['X-RateLimit-Remaining'], 0);
  });

  it('isolates different clients by IP key', () => {
    const limiter = createRateLimiter({
      windowMs: 2000,
      max: 1
    });

    let clientAPassed = 0;
    let clientBPassed = 0;

    const mockA = createMockReqRes('1.1.1.1');
    const mockB = createMockReqRes('2.2.2.2');

    limiter(mockA.req, mockA.res, (err) => { if (!err) clientAPassed++; });
    limiter(mockB.req, mockB.res, (err) => { if (!err) clientBPassed++; });

    assert.strictEqual(clientAPassed, 1);
    assert.strictEqual(clientBPassed, 1);
  });

  it('respects skip callback to bypass rate limiting', () => {
    const limiter = createRateLimiter({
      windowMs: 5000,
      max: 1,
      skip: (req) => req.isHealthCheck === true
    });

    let passed = 0;
    const next = (err) => { if (!err) passed++; };

    const { req, res } = createMockReqRes('3.3.3.3');
    req.isHealthCheck = true;

    // Even though max is 1, skipped requests always pass
    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    assert.strictEqual(passed, 3);
  });
});
