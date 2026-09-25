# Provenance

A phone-readable answer to two questions: what is actually true across every
repository on this machine, and what is waiting on a decision only you can make.

This is a **separate engine**, fed from this repository rather than added to its
read chain. `README.md` at the repository root keeps exactly one entry point;
this folder does not become a second one.

## Why it exists

You work from a phone. Git is not readable there without installing something or
standing up a server with an address and a port to remember, and you should not
have to do either to find out whether your own work is committed.

So this makes a page instead. One link, nothing installed, no address to keep.

## Run it

```
node provenance/scan.mjs      # reads git, writes state.json
node provenance/build.mjs     # writes app.html from the template
```

Then publish `app.html`. That is the whole loop.

`scan.mjs` runs `git` read-only against every repository it finds under the workspace (the nearest folder above it holding `STONE.md`, or `PROVENANCE_ROOT`)
to depth three. It never writes to a repository, never reaches the network, and
never reads a file's contents. Point it somewhere else with `PROVENANCE_ROOT`.

## What the page shows

- **The snapshot's own age**, as a `[WORN: n% faded]` marker with a one-hour
  half-life. As it ages the state colours desaturate toward grey.
- **Waiting on you** — the decisions from `decisions.json`, each with its real
  options and what each one costs. Tapping one stores the answer, and the answer
  is readable back out afterwards.
- **Every repository** — branch, last commit, whether anything is uncommitted,
  and whether the last fifty commits carry a machine signature.

## Why it fades

The page cannot reach the machine that made it. A snapshot that looks current
when it is hours old is the exact failure described in *Worn*: not a faded
record, which announces itself, but a confident one that is quietly wrong.

So it reports its age instead of hiding it, and the colours go first. When they
have gone you can still tell there was state to read, but not what it said. That
is the point, and it is the signal to run `scan.mjs` again.

## What it does not do

- It does not update by itself, and it cannot.
- It does not read file contents, diffs, or anything inside a commit beyond the
  author, subject line and trailers.
- It does not act on an answer. An answer is a record of your decision; the work
  still has to be done and shown to you.
- The machine-signature count reads the last fifty commits per repository. A
  clean count is not proof that an older commit is clean.
