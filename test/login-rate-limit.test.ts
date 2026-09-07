import assert from "node:assert/strict";
import { test } from "node:test";
import { LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW_MS, loginClientId, LoginRateLimiter } from "../src/login-rate-limit";

test("maps IPv4-mapped IPv6 addresses to IPv4", () => {
  assert.equal(loginClientId("::ffff:127.0.0.1"), "127.0.0.1");
  assert.equal(loginClientId("192.168.1.9"), "192.168.1.9");
  assert.equal(loginClientId(undefined), "unknown");
});

test("blocks a client after the failed-login limit and resets after success or expiry", () => {
  const limiter = new LoginRateLimiter();
  const start = 1_000_000;
  for (let attempt = 0; attempt < LOGIN_ATTEMPT_LIMIT; attempt += 1) {
    assert.equal(limiter.retryAfterSeconds("10.0.0.2", start + attempt), null);
    limiter.recordFailure("10.0.0.2", start + attempt);
  }
  assert.equal(limiter.retryAfterSeconds("10.0.0.2", start + LOGIN_ATTEMPT_LIMIT), Math.ceil(LOGIN_ATTEMPT_WINDOW_MS / 1000));
  assert.equal(limiter.retryAfterSeconds("10.0.0.3", start + LOGIN_ATTEMPT_LIMIT), null);
  limiter.recordSuccess("10.0.0.2");
  assert.equal(limiter.retryAfterSeconds("10.0.0.2", start + LOGIN_ATTEMPT_LIMIT + 1), null);
  limiter.recordFailure("10.0.0.4", start);
  limiter.recordFailure("10.0.0.5", start);
  assert.ok(limiter.trackedClients >= 2);
  assert.equal(limiter.retryAfterSeconds("10.0.0.4", start + LOGIN_ATTEMPT_WINDOW_MS), null);
  assert.equal(limiter.trackedClients, 0);
});
