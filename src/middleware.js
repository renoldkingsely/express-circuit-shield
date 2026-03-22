const { CircuitBreaker } = require('./CircuitBreaker');

// Global registry — each named circuit is a singleton per process
const registry = new Map();

/**
 * circuitShield(options) — Express middleware factory
 *
 * @param {object}   options
 * @param {string}   options.name              - Unique name for this circuit (required)
 * @param {number}   [options.failureThreshold] - Failures before opening (default: 5)
 * @param {number}   [options.successThreshold] - Successes to close from HALF_OPEN (default: 2)
 * @param {number}   [options.timeout]          - ms before retrying after OPEN (default: 10000)
 * @param {Function} [options.fallback]         - (req, res, status) => void — custom OPEN response
 * @param {Function} [options.onStateChange]    - (name, from, to) => void
 *
 * @example
 * app.use('/api/orders', circuitShield({ name: 'orders-service' }))
 */
function circuitShield(options = {}) {
  if (!options.name) {
    throw new Error('[express-circuit-shield] options.name is required');
  }

  if (!registry.has(options.name)) {
    registry.set(options.name, new CircuitBreaker(options));
  }
  const breaker = registry.get(options.name);

  return function circuitShieldMiddleware(req, res, next) {
    if (!breaker.canRequest()) {
      const status = breaker.getStatus();
      const retryIn = Math.ceil((status.nextAttemptTime - Date.now()) / 1000);

      if (typeof options.fallback === 'function') {
        return options.fallback(req, res, status);
      }

      return res.status(503).json({
        error: 'Service Unavailable',
        message: `Circuit "${options.name}" is OPEN. Retry after ${retryIn}s`,
        circuit: options.name,
        retryAfter: status.nextAttemptTime,
      });
    }

    // Intercept res.json and res.send to detect 5xx responses
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    function observe(statusCode) {
      if (statusCode >= 500) {
        breaker.recordFailure();
      } else {
        breaker.recordSuccess();
      }
    }

    res.json = function (body) {
      observe(res.statusCode);
      return originalJson(body);
    };

    res.send = function (body) {
      observe(res.statusCode);
      return originalSend(body);
    };

    // Catch errors passed to next(err)
    const originalNext = next;
    next = function (err) {
      if (err) breaker.recordFailure();
      originalNext(err);
    };

    next();
  };
}

/**
 * Get a snapshot of one or all circuit states.
 *
 * @param {string} [name] - Circuit name. Omit to get all circuits.
 * @returns {object|null}
 */
function getCircuitStatus(name) {
  if (name) {
    return registry.has(name) ? registry.get(name).getStatus() : null;
  }
  const all = {};
  for (const [key, breaker] of registry) {
    all[key] = breaker.getStatus();
  }
  return all;
}

/**
 * Ready-to-mount Express route handler that returns all circuit states as JSON.
 *
 * @example
 * app.get('/circuits', circuitStatusHandler)
 */
function circuitStatusHandler(req, res) {
  res.json(getCircuitStatus());
}

/**
 * Remove a circuit from the registry. Primarily used in tests.
 *
 * @param {string} name
 */
function resetCircuit(name) {
  registry.delete(name);
}

module.exports = { circuitShield, getCircuitStatus, circuitStatusHandler, resetCircuit };
