const { CircuitBreaker, STATE } = require('../src/CircuitBreaker');

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
    });
  });

  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      expect(breaker.state).toBe(STATE.CLOSED);
    });

    it('allows requests when CLOSED', () => {
      expect(breaker.canRequest()).toBe(true);
    });
  });

  describe('CLOSED → OPEN transition', () => {
    it('opens after reaching failureThreshold', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.state).toBe(STATE.CLOSED);

      breaker.recordFailure();
      expect(breaker.state).toBe(STATE.OPEN);
    });

    it('rejects requests immediately when OPEN', () => {
      for (let i = 0; i < 3; i++) breaker.recordFailure();
      expect(breaker.canRequest()).toBe(false);
    });

    it('resets failure count on success while CLOSED', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess(); // resets to 0
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.state).toBe(STATE.CLOSED); // still 1 short of threshold
    });
  });

  describe('OPEN → HALF_OPEN transition', () => {
    it('transitions to HALF_OPEN after timeout expires', async () => {
      breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1, timeout: 50 });
      breaker.recordFailure();
      expect(breaker.state).toBe(STATE.OPEN);

      await new Promise((r) => setTimeout(r, 60));

      expect(breaker.canRequest()).toBe(true);
      expect(breaker.state).toBe(STATE.HALF_OPEN);
    });

    it('does not transition before timeout expires', async () => {
      breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1, timeout: 5000 });
      breaker.recordFailure();

      expect(breaker.canRequest()).toBe(false);
      expect(breaker.state).toBe(STATE.OPEN);
    });
  });

  describe('HALF_OPEN → CLOSED transition', () => {
    async function openThenHalfOpen(cb) {
      breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 50,
        ...cb,
      });
      breaker.recordFailure();
      await new Promise((r) => setTimeout(r, 60));
      breaker.canRequest(); // triggers OPEN → HALF_OPEN
    }

    it('closes after reaching successThreshold from HALF_OPEN', async () => {
      await openThenHalfOpen({});
      breaker.recordSuccess();
      expect(breaker.state).toBe(STATE.HALF_OPEN);
      breaker.recordSuccess();
      expect(breaker.state).toBe(STATE.CLOSED);
    });

    it('returns to OPEN if probe request fails in HALF_OPEN', async () => {
      await openThenHalfOpen({});
      breaker.recordFailure();
      expect(breaker.state).toBe(STATE.OPEN);
    });
  });

  describe('onStateChange callback', () => {
    it('fires on CLOSED → OPEN transition', () => {
      const onChange = jest.fn();
      breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1, onStateChange: onChange });
      breaker.recordFailure();
      expect(onChange).toHaveBeenCalledWith('test', STATE.CLOSED, STATE.OPEN);
    });

    it('does not fire when state does not change', () => {
      const onChange = jest.fn();
      breaker = new CircuitBreaker({ name: 'test', failureThreshold: 3, onStateChange: onChange });
      breaker.recordFailure(); // still CLOSED
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns a complete snapshot of circuit state', () => {
      const status = breaker.getStatus();
      expect(status).toMatchObject({
        name: 'test',
        state: STATE.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        nextAttemptTime: null,
      });
    });
  });
});
