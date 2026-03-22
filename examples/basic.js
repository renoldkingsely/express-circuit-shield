/**
 * Basic example — simulates a flaky external service
 * to demonstrate the circuit breaker opening and recovering.
 *
 * Run: node examples/basic.js
 *
 * Then in another terminal:
 *   for i in $(seq 1 12); do curl -s http://localhost:3000/api/data | jq; done
 *   curl http://localhost:3000/circuits
 */

const express = require('express');
const { circuitShield, circuitStatusHandler } = require('../src');

const app = express();

// Simulate a flaky external service
let callCount = 0;
function flakyService() {
  callCount++;
  // Fails on calls 3 through 8, then recovers
  if (callCount >= 3 && callCount <= 8) {
    throw new Error('External service unavailable');
  }
  return { message: 'OK', callNumber: callCount };
}

// Protect the route with a circuit breaker
app.get(
  '/api/data',
  circuitShield({
    name: 'flaky-service',
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 5000, // short timeout for demo purposes
    onStateChange: (name, from, to) => {
      console.log(`\n[Circuit: ${name}]  ${from} → ${to}\n`);
    },
  }),
  (req, res) => {
    try {
      const data = flakyService();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Live dashboard — all circuit states
app.get('/circuits', circuitStatusHandler);

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
  console.log('');
  console.log('Try these commands in another terminal:');
  console.log('  for i in $(seq 1 12); do curl -s http://localhost:3000/api/data; echo; done');
  console.log('  curl http://localhost:3000/circuits');
});
