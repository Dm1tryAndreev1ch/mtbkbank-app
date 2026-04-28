// TEST-06 — Maestro runScript helper.
// Calls POST /test/trigger-card-drop which emulates a card purchase and
// emits CARD_DROPPED via broadcastToUser to the test account's socket room.
// Requires E2E_TEST_TOKEN env var (injected by e2e-nightly.yml).
const http = require('http');

const options = {
  hostname: process.env.E2E_API_HOST || '10.0.2.2',
  port: parseInt(process.env.E2E_API_PORT || '3000', 10),
  path: '/test/trigger-card-drop',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.E2E_TEST_TOKEN}`,
  },
};

const req = http.request(options, (res) => {
  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new Error(`trigger-card-drop failed with status ${res.statusCode}`);
  }
});
req.on('error', (e) => { throw e; });
req.end();
