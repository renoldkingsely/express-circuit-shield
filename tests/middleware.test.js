const express = require('express');
const request = require('supertest');
const { circuitShield, circuitStatusHandler, getCircuitStatus, resetCircuit } = require('../src');

function buildApp(shieldOptions, routeHandler) {
  const app = express();
  app.get('/test', circuitShield(shieldOptions), routeHandler);
  app.get('/circuits', circuitStatusHandler);
  // Generic error handler
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return app;
}

describe('circuitShield middleware', () => {
  const NAME = 'test-circuit';

  afterEach(() => resetCircuit(NAME));

  describe('configuration', () => {
    it('throws if options.name is not provided', () => {
      expect(() => circuitShield({})).toThrow('[express-circuit-shield] options.name is required');
    });
  });

  describe('CLOSED state — normal operation', () => {
    it('passes requests through and returns route response', async () => {
      const app = buildApp({ name: NAME }, (req, res) => res.json({ ok: true }));
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('records success on 2xx response', async () => {
      const app = buildApp({ name: NAME }, (req, res) => res.json({ ok: true }));
      await request(app).get('/test');
      const status = getCircuitStatus(NAME);
      expect(status.failureCount).toBe(0);
    });
  });

  describe('OPEN state — circuit tripped', () => {
    it('returns 503 when circuit is OPEN', async () => {
      const app = buildApp(
        { name: NAME, failureThreshold: 2, timeout: 60000 },
        (req, res) => res.status(500).json({ error: 'downstream failure' })
      );

      await request(app).get('/test');
      await request(app).get('/test'); // trips open

      const res = await request(app).get('/test');
      expect(res.status).toBe(503);
      expect(res.body.circuit).toBe(NAME);
      expect(res.body.retryAfter).toBeDefined();
    });

    it('calls custom fallback when circuit is OPEN', async () => {
      const fallback = jest.fn((req, res) => res.status(200).json({ cached: true }));
      const app = buildApp(
        { name: NAME, failureThreshold: 1, timeout: 60000, fallback },
        (req, res) => res.status(500).json({ error: 'fail' })
      );

      await request(app).get('/test'); // trips open
      const res = await request(app).get('/test');

      expect(fallback).toHaveBeenCalled();
      expect(res.body.cached).toBe(true);
    });
  });

  describe('failure detection', () => {
    it('counts 5xx responses as failures', async () => {
      const app = buildApp(
        { name: NAME, failureThreshold: 5 },
        (req, res) => res.status(500).json({ error: 'fail' })
      );
      await request(app).get('/test');
      const status = getCircuitStatus(NAME);
      expect(status.failureCount).toBe(1);
    });

    it('counts next(err) as a failure', async () => {
      const app = buildApp(
        { name: NAME },
        (req, res, next) => next(new Error('kaboom'))
      );
      await request(app).get('/test');
      const status = getCircuitStatus(NAME);
      expect(status.failureCount).toBe(1);
    });

    it('does not count 4xx responses as failures', async () => {
      const app = buildApp(
        { name: NAME },
        (req, res) => res.status(404).json({ error: 'not found' })
      );
      await request(app).get('/test');
      const status = getCircuitStatus(NAME);
      expect(status.failureCount).toBe(0);
    });
  });

  describe('circuitStatusHandler', () => {
    it('returns JSON with state of all circuits', async () => {
      const app = buildApp({ name: NAME }, (req, res) => res.json({ ok: true }));
      await request(app).get('/test');

      const res = await request(app).get('/circuits');
      expect(res.status).toBe(200);
      expect(res.body[NAME]).toBeDefined();
      expect(res.body[NAME].state).toBe('CLOSED');
    });
  });
});
