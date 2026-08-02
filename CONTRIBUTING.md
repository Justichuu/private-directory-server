# Contributing

Contributions are welcome through focused issues and pull requests.

This project accepts human-written and AI-assisted contributions. If an AI tool materially generated or transformed the change, disclose that in the pull request and follow [the AI collaboration policy](docs/AI_COLLABORATION.md).

1. Create a branch from `main`.
2. Run `npm ci`.
3. Make a narrow change with strict TypeScript and no runtime dependency unless it is necessary.
4. Add or update integration tests.
5. Run `npm run check` and `npm test`.
6. Explain security and compatibility effects in the pull request.
7. Confirm that you reviewed and can explain generated code.

Never commit access tokens, private paths, shared files, logs containing personal information, or generated `dist` and `release` directories.

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
