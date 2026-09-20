import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

describe('Health Endpoints (Phase 1)', () => {
  test('GET / returns 200 with service information', async () => {
    // Create mock request and response objects
    const req = {
      method: 'GET',
      url: '/',
      headers: {}
    };

    let statusCode = null;
    let jsonResponse = null;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    // Find root route handler
    const rootLayer = app._router.stack.find(layer => layer.route && layer.route.path === '/');
    assert.ok(rootLayer, 'Root route / should exist');

    await rootLayer.handle(req, res, () => {});

    assert.equal(statusCode, 200);
    assert.equal(jsonResponse.success, true);
    assert.equal(jsonResponse.name, 'Trao AI Interview Prep Kit API');
    assert.equal(jsonResponse.phase, 'Phase 1 Foundation');
  });

  test('GET /api/v1/health/ping returns pong message', async () => {
    const { getPing } = await import('../src/controllers/healthController.js');

    let statusCode = null;
    let jsonResponse = null;

    const req = {};
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    getPing(req, res);

    assert.equal(statusCode, 200);
    assert.equal(jsonResponse.success, true);
    assert.equal(jsonResponse.message, 'pong');
    assert.ok(jsonResponse.timestamp);
  });

  test('GET /api/v1/health returns health metadata structure', async () => {
    const { getHealth } = await import('../src/controllers/healthController.js');

    let statusCode = null;
    let jsonResponse = null;

    const req = {};
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      }
    };

    getHealth(req, res);

    assert.equal(statusCode, 200);
    assert.equal(jsonResponse.success, true);
    assert.ok(jsonResponse.data.service);
    assert.ok(jsonResponse.data.system);
    assert.ok(jsonResponse.data.database);
    assert.equal(jsonResponse.data.database.provider, 'mongodb');
  });
});
