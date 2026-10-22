// The page displays GitHub repository names, never transport credentials or
// local filesystem locations. Other hosts and unrecognized forms are omitted.
export function publicRemote(value, allowSlug = false) {
  if (typeof value !== 'string') return '';
  let candidate = '';
  if (allowSlug && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    candidate = value;
  } else if (value.startsWith('git@github.com:')) {
    candidate = value.slice('git@github.com:'.length);
  } else {
    try {
      const url = new URL(value);
      if (url.hostname !== 'github.com' || !['https:', 'ssh:'].includes(url.protocol)) return '';
      candidate = url.pathname.slice(1);
    } catch { return ''; }
  }
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(candidate)
    ? candidate.replace(/\/$/, '').replace(/\.git$/, '') : '';
}
