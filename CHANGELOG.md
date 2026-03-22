# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-03-22

### Added

- `circuitShield(options)` — Express middleware factory with CLOSED / OPEN / HALF_OPEN state machine
- `circuitStatusHandler` — ready-to-mount Express route handler that returns live circuit state as JSON
- `getCircuitStatus(name?)` — programmatic access to one or all circuit snapshots
- `resetCircuit(name)` — removes a circuit from the registry (primarily for test teardown)
- `CircuitBreaker` class exported for advanced use cases
- `STATE` constants (`CLOSED`, `OPEN`, `HALF_OPEN`) exported for use in `onStateChange` callbacks
- Per-process circuit registry — each named circuit is a singleton, shared across routes
- Automatic failure detection by intercepting `res.end` — no manual reporting required
- `onStateChange(name, from, to)` callback fires on every state transition
- Custom `fallback(req, res, status)` support when circuit is OPEN
- Default `503 Service Unavailable` JSON response with `retryAfter` timestamp when circuit is OPEN
- 21 unit and integration tests with ~98% statement coverage
- Basic usage example with flaky service simulation (`examples/basic.js`)

[1.0.0]: https://github.com/yourusername/express-circuit-shield/releases/tag/v1.0.0
