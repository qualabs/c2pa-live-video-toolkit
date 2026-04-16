# C2PA Live Video Toolkit Contributing Guide

Thank you for investing your time in contributing to the C2PA Live Video Toolkit.

Read our [Code of Conduct](./CODE_OF_CONDUCT.md) to keep our community approachable and respectable.

In this guide you will get an overview of the contribution workflow from opening an issue, creating a PR, reviewing, and merging the PR.

## Getting started

### Issues

#### Create a new issue

If you spot a problem with the docs or code, [search if an issue already exists](https://github.com/qualabs/c2pa-live-video-toolkit/issues). If a related issue doesn't exist, you can open a [new issue](https://github.com/qualabs/c2pa-live-video-toolkit/issues/new).

#### Solve an issue

Scan through our [existing issues](https://github.com/qualabs/c2pa-live-video-toolkit/issues) to find one that interests you. You can narrow down the search using `labels` as filters. If you find an issue to work on, you are welcome to open a PR with a fix.

### Make Changes

1. Fork the repository.

2. Install **Node.js 22+** (we recommend using [nvm](https://github.com/nvm-sh/nvm) — run `nvm use` in the repo root to pick up the pinned version from `.nvmrc`).

3. Install dependencies at the monorepo root:

   ```bash
   npm install
   ```

4. Create a working branch and start with your changes!

5. Add tests for your changes when applicable. The publishable libraries have test suites:
   - `packages/dashjs-plugin/` — `cd packages/dashjs-plugin && npm test`
   - `packages/videojs-ui/` — `cd packages/videojs-ui && npm test`

6. Add or update documentation for your changes.

### Commit your update

1. Run `npm run lint` to check code style (ESLint 9 + Prettier).

2. Run `npm run typecheck` to verify TypeScript types across all packages.

3. Run tests to make sure nothing is broken:

   ```bash
   cd packages/dashjs-plugin && npm test
   cd packages/videojs-ui && npm test
   ```

4. Make sure to include a commit message that describes the change, following the [Conventional Commits](https://www.conventionalcommits.org/) format.

### Pull Request

When you're finished with the changes, create a pull request.

- Fill in the PR description so reviewers can understand the context and purpose of your changes.
- Link to the related issue if one exists.
- Make sure all CI checks pass before requesting review.
