/**
 * Reads the real state of every repository under F:\Code and writes state.json.
 * Nothing here reaches the network. Nothing here writes to any repository.
 * Run it, then publish app.html. The page shows only what this file recorded.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.PROVENANCE_ROOT || 'F:/Code';
const OUT = path.join(import.meta.dirname, 'state.json');

const git = (cwd, args) => {
  try {
    return execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch { return ''; }
};

function findRepos(dir, depth = 0, found = []) {
  if (depth > 3) return found;
  let entries = [];
  try { entries = fs.readdirSync(dir, {withFileTypes: true}); } catch { return found; }
  if (entries.some(e => e.name === '.git')) found.push(dir);
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (['.git', 'node_modules', '_workstation', '.tmp', 'sandbox', 'staging'].includes(e.name)) continue;
    findRepos(path.join(dir, e.name), depth + 1, found);
  }
  return found;
}

const repos = findRepos(ROOT).map(dir => {
  const rel = path.relative(ROOT, dir).split(String.fromCharCode(92)).join('/');
  const dirty = git(dir, ['status', '--porcelain']).split('\n').filter(Boolean).length;
  const branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(dir, ['log', '-1', '--format=%h\u0001%s\u0001%cI']);
  const [hash, subject, when] = head ? head.split('\u0001') : ['', '', ''];
  const remote = git(dir, ['remote', 'get-url', 'origin']);
  let ahead = '';
  if (remote) {
    const counts = git(dir, ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`]);
    if (counts) { const [b, a] = counts.split(/\s+/); ahead = `${a} ahead, ${b} behind`; }
  }
  // Machine authorship in the last 50 commits. The rule this checks is the
  // owner's: nothing that lands in a repository may carry an AI signature.
  const authors = git(dir, ['log', '-50', '--format=%ae']).split('\n').filter(Boolean);
  const bodies = git(dir, ['log', '-50', '--format=%B']);
  const machineAuthor = authors.filter(a => /cursor|claude|copilot|\bbot\b/i.test(a)).length;
  const machineTrailer = (bodies.match(/co-authored-by:\s*(claude|cursor|copilot)|claude-session:|generated with \[?claude/gi) || []).length;
  return {
    name: path.basename(dir), rel, branch, hash, subject,
    when, dirty, remote: remote.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, ''),
    ahead, machineAuthor, machineTrailer
  };
}).sort((a, b) => (b.when || '').localeCompare(a.when || ''));

const state = {
  generated: new Date().toISOString(),
  root: ROOT,
  repos,
  totals: {
    repos: repos.length,
    dirty: repos.filter(r => r.dirty > 0).length,
    machine: repos.filter(r => r.machineAuthor || r.machineTrailer).length
  }
};
fs.writeFileSync(OUT, JSON.stringify(state, null, 2), 'utf8');
console.log(`${repos.length} repositories, ${state.totals.dirty} with uncommitted work, ${state.totals.machine} carrying a machine signature`);
console.log(`written to ${OUT}`);
