/**
 * Builds app.html from app.template.html, state.json and decisions.json.
 * Run scan.mjs first. Nothing here reaches the network.
 *
 *   node provenance/scan.mjs
 *   node provenance/build.mjs
 *
 * Then publish app.html. The published page is a snapshot of the moment
 * scan.mjs ran, and says so on its face.
 */
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');

const template = read('app.template.html');
const state = JSON.parse(read('state.json'));
const decisions = JSON.parse(read('decisions.json'));

// Only the fields the page actually renders. Keeping the payload to what is
// displayed means nothing travels into a published page unexamined.
const slim = {
  generated: state.generated,
  totals: state.totals,
  repos: state.repos.map(r => ({
    name: r.name, rel: r.rel, branch: r.branch, hash: r.hash,
    subject: r.subject, dirty: r.dirty, remote: r.remote,
    machineAuthor: r.machineAuthor, machineTrailer: r.machineTrailer
  }))
};

// A lone </script> inside injected data would close the page's script early.
const safe = (v) => JSON.stringify(v).split('</').join('<\\/');

const out = template
  .replace('/*__STATE__*/{"generated":"","repos":[],"totals":{"repos":0,"dirty":0,"machine":0}}', safe(slim))
  .replace('/*__DECISIONS__*/[]', safe(decisions));

if (out.includes('__STATE__') || out.includes('__DECISIONS__')) {
  console.error('A placeholder was not replaced. app.html was not written.');
  process.exit(1);
}

fs.writeFileSync(path.join(here, 'app.html'), out, 'utf8');
console.log(`app.html written: ${slim.repos.length} repositories, ${decisions.length} decisions, snapshot ${slim.generated}`);
