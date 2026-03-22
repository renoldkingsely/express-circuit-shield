# express-circuit-shield

> A plug-and-play circuit breaker middleware for Express.js — protect your app from cascading failures caused by slow or failing external services.

[![npm version](https://img.shields.io/npm/v/express-circuit-shield.svg)](https://www.npmjs.com/package/express-circuit-shield)
[![license](https://img.shields.io/npm/l/express-circuit-shield.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## The Problem

When your Express app depends on external services — REST APIs, databases, microservices — a single failing service can take down your entire application.

```
User → Your Express App → External API (DOWN)
                               ↑
                    waits 30s... timeout... error
                    waits 30s... timeout... error
                         ↑
              500 users waiting simultaneously
                         ↑
                   Your app crashes
```

This is called a **cascading failure** — one broken dependency kills everything else.

Most Node.js circuit breaker libraries (like `opossum`) require you to wrap every function call individually, forcing you to rewrite your existing code. There was no clean, route-level solution built specifically for Express — until now.

---

## The Solution

`express-circuit-shield` works as a standard Express middleware — drop it in front of any route, zero refactoring required.

```js
app.use('/api/payments', circuitShield({ name: 'payments' }))
```

That's it. Your route is now protected.

---

## How It Works — The 3 States

```
         failures >= threshold          timeout expires
CLOSED ─────────────────────► OPEN ──────────────────► HALF-OPEN
  ▲                                                         │
  │              successes >= threshold                     │
  └─────────────────────────────────────────────────────────┘
                                          │  failure
                                          └──────► OPEN (again)
```

| State | What it means | What happens to requests |
|-------|--------------|--------------------------|
| **CLOSED** | Everything is normal | Pass through as usual |
| **OPEN** | Too many failures detected | Instantly rejected — no waiting |
| **HALF-OPEN** | Testing if service recovered | One probe request allowed through |

### In plain English

1. Requests pass through normally **(CLOSED)**
2. After 5 failures in a row → circuit **OPENS** — stops hitting the dead service
3. After 10 seconds → **HALF-OPEN** — sends one test request through
4. If it succeeds → back to **CLOSED** (service recovered)
5. If it fails → back to **OPEN** (still down, wait again)

---

## How It Compares to opossum

[opossum](https://github.com/nodeshift/opossum) is a well-established and battle-tested circuit breaker for Node.js. If you need function-level control or are working outside of Express, opossum is an excellent choice.

`express-circuit-shield` takes a different approach — it is built specifically for Express and works at the **route level** as standard middleware, so you can add resilience without touching your existing route logic.

| | opossum | express-circuit-shield |
|--|---------|----------------------|
| Works as Express middleware | No | Yes |
| Requires wrapping every function call | Yes | No |
| Drop-in with zero code refactor | No | Yes |
| Route-level granularity | No | Yes |
| Built-in status dashboard endpoint | No | Yes |
| Works outside Express (generic Node.js) | Yes | No |
| Mature, production-battle-tested | Yes | Growing |

**Use opossum** if you need fine-grained control at the function level or are not using Express.

**Use express-circuit-shield** if you want route-level protection in Express with zero refactoring.

---

## Installation

```bash
npm install express-circuit-shield
```

---

## Quick Start

```js
const express = require('express');
const { circuitShield } = require('express-circuit-shield');

const app = express();

app.get(
  '/api/orders',
  circuitShield({ name: 'orders-service' }),
  async (req, res) => {
    const result = await callOrdersAPI();
    res.json(result);
  }
);

app.listen(3000);
```

---

## API Reference

### `circuitShield(options)`

Returns an Express middleware. Apply it to any route or router.

```js
const { circuitShield } = require('express-circuit-shield');

app.use('/api/data', circuitShield({
  name: 'my-service',          // required — unique name for this circuit
  failureThreshold: 5,         // failures before opening  (default: 5)
  successThreshold: 2,         // successes to close from half-open (default: 2)
  timeout: 10000,              // ms before retrying after open (default: 10000)
  fallback: (req, res) => {},  // custom response when circuit is open (optional)
  onStateChange: (name, from, to) => {}, // called on state transitions (optional)
}));
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | **required** | Unique identifier for this circuit breaker |
| `failureThreshold` | `number` | `5` | Number of consecutive failures before the circuit opens |
| `successThreshold` | `number` | `2` | Number of consecutive successes to close from HALF-OPEN |
| `timeout` | `number` | `10000` | Milliseconds to wait before transitioning from OPEN to HALF-OPEN |
| `fallback` | `Function` | `null` | `(req, res, status) => void` — custom handler when circuit is OPEN |
| `onStateChange` | `Function` | `null` | `(name, fromState, toState) => void` — called on every state transition |

---

### `circuitStatusHandler`

A ready-to-mount Express route handler that returns the live status of all registered circuits.

```js
const { circuitStatusHandler } = require('express-circuit-shield');

app.get('/circuits', circuitStatusHandler);
```

**Response:**

```json
{
  "payments": {
    "name": "payments",
    "state": "OPEN",
    "failureCount": 5,
    "successCount": 0,
    "lastFailureTime": 1711090800000,
    "nextAttemptTime": 1711090810000
  },
  "inventory": {
    "name": "inventory",
    "state": "CLOSED",
    "failureCount": 0,
    "successCount": 3,
    "lastFailureTime": null,
    "nextAttemptTime": null
  }
}
```

---

### `getCircuitStatus(name?)`

Programmatically get the status of one or all circuits.

```js
const { getCircuitStatus } = require('express-circuit-shield');

getCircuitStatus('payments'); // status of one circuit
getCircuitStatus();           // status of all circuits
```

---

### `resetCircuit(name)`

Removes a circuit from the registry. Primarily useful in tests.

```js
const { resetCircuit } = require('express-circuit-shield');

afterEach(() => resetCircuit('payments'));
```

---

## Usage Examples

### Basic Route Protection

```js
const express = require('express');
const { circuitShield } = require('express-circuit-shield');

const app = express();

app.get(
  '/api/weather',
  circuitShield({ name: 'weather-api' }),
  async (req, res) => {
    const data = await fetch('https://api.weather.com/today').then(r => r.json());
    res.json(data);
  }
);
```

---

### Custom Fallback Response

Return cached data or a graceful message instead of a raw 503:

```js
app.use(
  '/api/recommendations',
  circuitShield({
    name: 'recommendations',
    fallback: (req, res) => {
      res.json({ items: [], message: 'Showing default content while service recovers.' });
    },
  })
);
```

---

### Monitor State Changes (Logging / Alerting)

```js
app.use(
  '/api/inventory',
  circuitShield({
    name: 'inventory-service',
    onStateChange: (name, from, to) => {
      console.warn(`[Circuit: ${name}] ${from} → ${to}`);
      // Send alert to Slack, PagerDuty, etc.
      if (to === 'OPEN') alertTeam(`Circuit ${name} is OPEN — service may be down`);
    },
  })
);
```

---

### Protect Multiple Services Independently

Each circuit is isolated. One service going down does not affect others.

```js
app.use('/api/payments',       circuitShield({ name: 'payments' }));
app.use('/api/inventory',      circuitShield({ name: 'inventory' }));
app.use('/api/notifications',  circuitShield({ name: 'notifications' }));
```

---

### Apply to an Entire Router

```js
const paymentsRouter = require('./routes/payments');
const { circuitShield } = require('express-circuit-shield');

app.use('/api/orders', circuitShield({ name: 'orders-service' }), ordersRouter);
```

---

### Live Status Dashboard

```js
app.get('/circuits', circuitStatusHandler);
```

Mount this on an internal/admin route to monitor all your circuit states in real time — useful for debugging and ops dashboards.

---

## Default 503 Response (when circuit is OPEN)

When no fallback is provided and the circuit is OPEN, the middleware returns:

```json
{
  "error": "Service Unavailable",
  "message": "Circuit \"orders-service\" is OPEN. Retry after 8s",
  "circuit": "orders-service",
  "retryAfter": 1711090810000
}
```

HTTP status code: `503`

---

## How Failures Are Detected

The middleware intercepts `res.json()` and `res.send()` calls automatically:

- **5xx status codes** → counted as failures
- **2xx / 3xx / 4xx** → counted as successes
- **Errors passed to `next(err)`** → counted as failures

You do not need to manually report success or failure — it is handled transparently.

---

## Running the Example

```bash
git clone https://github.com/renoldkingsely/express-circuit-shield.git
cd express-circuit-shield
npm install
npm run example
```

Then in another terminal:

```bash
# Hit the route repeatedly to see the circuit open
for i in $(seq 1 10); do curl http://localhost:3000/api/data; echo; done

# Check live circuit status
curl http://localhost:3000/circuits
```

Watch the terminal logs as the circuit transitions: `CLOSED → OPEN → HALF-OPEN → CLOSED`

---

## Running Tests

```bash
npm test
```

---

## Project Structure

```
express-circuit-shield/
├── src/
│   ├── index.js          # Package entry point
│   ├── CircuitBreaker.js # Core state machine (CLOSED / OPEN / HALF-OPEN)
│   └── middleware.js     # Express middleware, registry, and status handler
├── tests/
│   ├── CircuitBreaker.test.js
│   └── middleware.test.js
├── examples/
│   └── basic.js
└── package.json
```

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## License

[MIT](LICENSE)

---

## Related

- [opossum](https://github.com/nodeshift/opossum) — Function-level circuit breaker for Node.js
- [Resilience4j](https://github.com/resilience4j/resilience4j) — Circuit breaker for Java
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html) — Martin Fowler's original writeup
