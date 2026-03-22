import { RequestHandler, Request, Response } from 'express';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitStatus {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  nextAttemptTime: number | null;
}

export interface CircuitShieldOptions {
  /** Unique identifier for this circuit breaker. Required. */
  name: string;
  /** Number of consecutive failures before the circuit opens. Default: 5 */
  failureThreshold?: number;
  /** Number of consecutive successes to close from HALF_OPEN. Default: 2 */
  successThreshold?: number;
  /** Milliseconds to wait before transitioning from OPEN to HALF_OPEN. Default: 10000 */
  timeout?: number;
  /** Milliseconds before a slow request is aborted and counted as a failure. Default: disabled */
  requestTimeout?: number;
  /** Custom handler called when the circuit is OPEN instead of the default 503 response. */
  fallback?: (req: Request, res: Response, status: CircuitStatus) => void;
  /** Called on every state transition. */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

/**
 * Express middleware factory. Returns a middleware that protects the route
 * with a circuit breaker. Drop it in front of any route or router.
 *
 * @example
 * app.use('/api/orders', circuitShield({ name: 'orders-service' }))
 */
export function circuitShield(options: CircuitShieldOptions): RequestHandler;

/**
 * Ready-to-mount Express route handler that returns the live status
 * of all registered circuits as JSON.
 *
 * @example
 * app.get('/circuits', circuitStatusHandler)
 */
export const circuitStatusHandler: RequestHandler;

/**
 * Returns a snapshot of one or all circuit states.
 * @param name - Circuit name. Omit to get all circuits.
 */
export function getCircuitStatus(name: string): CircuitStatus | null;
export function getCircuitStatus(): Record<string, CircuitStatus>;

/**
 * Removes a circuit from the registry.
 * Primarily used in test teardown.
 */
export function resetCircuit(name: string): void;

/** STATE constants for use in onStateChange callbacks. */
export const STATE: {
  readonly CLOSED: 'CLOSED';
  readonly OPEN: 'OPEN';
  readonly HALF_OPEN: 'HALF_OPEN';
};

/** The core CircuitBreaker class, exported for advanced use cases. */
export class CircuitBreaker {
  constructor(options: CircuitShieldOptions);
  readonly state: CircuitState;
  canRequest(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
  getStatus(): CircuitStatus;
}
