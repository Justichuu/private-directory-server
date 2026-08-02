# AI-assisted collaboration

This project is intentionally developed through human and AI collaboration. It is acceptable to call the process vibe coding. It is not acceptable to use AI involvement to avoid understanding, testing, attribution, or responsibility.

## Responsibilities

Human collaborators decide:

- Product purpose and acceptable scope
- Which files and systems may be changed
- Security and privacy expectations
- Whether staged work is committed, published, or released

AI tools may assist with:

- Code and documentation drafts
- Repository and dependency analysis
- Test design and execution
- Security-boundary review
- Packaging and workflow generation

## Contribution expectations

When AI materially assists a contribution:

1. State that assistance in the pull request.
2. Explain the behavior being changed in your own words.
3. Review the entire generated diff, including configuration and documentation.
4. Run the documented checks and tests.
5. Verify the real user-facing or runtime surface when applicable.
6. Remove invented claims, fake citations, copied secrets, private paths, and unrelated generated changes.
7. Remain responsible for maintaining the submitted result.

## Evidence standard

The project does not treat generated code, compilation, or an exit code of zero as final proof. Security-sensitive changes need regression tests. UI changes need a real render. Distribution changes need a built package and startup check. Unavailable checks must be reported explicitly.

## Authorship

Jaye is the project creator and publisher. Individual commits and pull requests retain their recorded authorship. AI systems are development tools and collaborators, not legal copyright holders or release authorities.
