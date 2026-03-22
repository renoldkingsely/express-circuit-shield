const STATE = {
  CLOSED: 'CLOSED',       // Normal — requests pass through
  OPEN: 'OPEN',           // Failing — requests rejected immediately
  HALF_OPEN: 'HALF_OPEN', // Testing — one probe request allowed through
};

class CircuitBreaker {
  /**
   * @param {object} options
   * @param {string} options.name              - Unique name for this circuit
   * @param {number} [options.failureThreshold=5]  - Failures before opening
   * @param {number} [options.successThreshold=2]  - Successes to close from HALF_OPEN
   * @param {number} [options.timeout=10000]        - ms before transitioning OPEN → HALF_OPEN
   * @param {Function} [options.onStateChange]      - (name, fromState, toState) => void
   */
  constructor(options = {}) {
    this.name = options.name ?? 'default';
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.timeout = options.timeout ?? 10000;
    this.onStateChange = options.onStateChange ?? null;

    this._state = STATE.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  get state() {
    return this._state;
  }

  /**
   * Returns true if a request should be allowed through.
   * Automatically transitions OPEN → HALF_OPEN when timeout expires.
   */
  canRequest() {
    if (this._state === STATE.CLOSED) return true;

    if (this._state === STATE.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this._transition(STATE.HALF_OPEN);
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow one probe request
    return true;
  }

  /**
   * Record a successful response.
   * In HALF_OPEN: accumulate successes until threshold, then close.
   * In CLOSED: reset failure count.
   */
  recordSuccess() {
    if (this._state === STATE.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this._reset();
        this._transition(STATE.CLOSED);
      }
    } else {
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed response.
   * In HALF_OPEN: probe failed — trip back to OPEN immediately.
   * In CLOSED: increment failure count and trip if threshold reached.
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this._state === STATE.HALF_OPEN || this.failureCount >= this.failureThreshold) {
      this._trip();
    }
  }

  /**
   * Returns a snapshot of the current circuit state.
   * @returns {object}
   */
  getStatus() {
    return {
      name: this.name,
      state: this._state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  _trip() {
    this.nextAttemptTime = Date.now() + this.timeout;
    this._transition(STATE.OPEN);
  }

  _reset() {
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = null;
  }

  _transition(newState) {
    const prev = this._state;
    this._state = newState;
    if (prev !== newState && typeof this.onStateChange === 'function') {
      this.onStateChange(this.name, prev, newState);
    }
  }
}

module.exports = { CircuitBreaker, STATE };
