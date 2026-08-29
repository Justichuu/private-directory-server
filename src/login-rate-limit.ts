export const LOGIN_ATTEMPT_LIMIT = 5;
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  windowStart: number;
}

/** Counts failed browser logins per client and blocks further attempts in the window. */
export class LoginRateLimiter {
  private readonly attempts = new Map<string, AttemptRecord>();

  retryAfterSeconds(clientId: string, now = Date.now()): number | null {
    const record = this.attempts.get(clientId);
    if (record === undefined) return null;
    if (now - record.windowStart >= LOGIN_ATTEMPT_WINDOW_MS) {
      this.attempts.delete(clientId);
      return null;
    }
    if (record.count < LOGIN_ATTEMPT_LIMIT) return null;
    return Math.max(1, Math.ceil((record.windowStart + LOGIN_ATTEMPT_WINDOW_MS - now) / 1000));
  }

  recordFailure(clientId: string, now = Date.now()): void {
    const record = this.attempts.get(clientId);
    if (record === undefined || now - record.windowStart >= LOGIN_ATTEMPT_WINDOW_MS) {
      this.attempts.set(clientId, { count: 1, windowStart: now });
      return;
    }
    record.count += 1;
  }

  recordSuccess(clientId: string): void {
    this.attempts.delete(clientId);
  }
}

export function loginClientId(remoteAddress: string | undefined): string {
  if (remoteAddress === undefined || remoteAddress === "") return "unknown";
  return remoteAddress.startsWith("::ffff:") ? remoteAddress.slice(7) : remoteAddress;
}
