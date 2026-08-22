# Repository Guidelines

## Project Structure & Module Organization

Application code lives in `src/`. `src/index.ts` loads environment variables and starts the HTTP server; `src/app.ts` configures Express and the `/mcp` endpoint. MCP tools, prompts, and server registration belong in `src/mcp/`. Keep Santander API access in `src/services/`, request middleware in `src/middleware/`, and external data shapes in `src/types/`. TypeScript compiles into `dist/`; do not edit or commit generated output. Deployment files (`Dockerfile`, `.gcloudignore`) and evaluation cases (`evaluations.xml`) live at the repository root.

## Build, Test, and Development Commands

- `npm install`: install the locked dependencies from `package-lock.json`.
- `npm run dev`: run `src/index.ts` directly with `tsx`.
- `npm run build`: type-check and compile the project with `tsc` into `dist/`.
- `npm start`: run the compiled server from `dist/src/index.js`.
- `npm run inspect`: open the Model Context Protocol Inspector for manual tool and prompt checks.
- `docker build -t tus-mcp .`: build the production container.

Run `npm run build` before submitting changes. The server listens on port `3000` by default.

## Coding Style & Naming Conventions

Use strict TypeScript and ES modules. Preserve the existing four-space indentation, single quotes, semicolons, and `.js` suffixes in relative imports required by `NodeNext`. Use `camelCase` for variables and functions, `PascalCase` for classes and interfaces, and descriptive lowercase filenames such as `santander.service.ts`. MCP tool and prompt names use `snake_case` with the `santander_` prefix. No formatter or linter is configured; match surrounding code and rely on `npm run build` for compiler checks.

## Testing Guidelines

There is currently no automated test runner or coverage threshold. Validate every change by building, starting the server, and exercising affected tools through `npm run inspect`. Update `evaluations.xml` when tool behavior or expected responses change. If adding automated tests, use `*.test.ts` names near the tested module and add the corresponding `npm test` script in the same change.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commit-style subjects such as `feat:`, `refactor:`, and `fix:`. Keep commits focused and write imperative, concise summaries. Pull requests should explain the behavior change, list verification commands, link relevant issues, and note any environment or API-contract changes. Include Inspector output or screenshots when MCP responses or client-visible behavior changes.

## Security & Configuration

Keep `.env`, tokens, and credentials out of Git. Document new settings in `README.md`. Use `MCP_TOKEN` for exposed deployments and restrict `ALLOWED_HOSTS`; never log authorization values.
