# TUS Santander MCP Server

MCP server for Santander's TUS bus data. Every tool reads the official Santander Open Data API over HTTPS, validates every page with Zod at runtime, and returns validated structured output.

## Tools

- `santander_get_bus_stops`
  - `limit`: integer from 1 to 100; defaults to 10.
  - `search`: optional name, address, public stop number, or API resource ID.
  - Exact public stop-number matches are returned first.
- `santander_get_bus_lines`
  - `search`: optional public line number, name, or API resource ID.
- `santander_get_bus_line_stops`
  - `lineId`: required public line number from `lineas_bus["ayto:numero"]`, such as `24C1` or `N2`.
- `santander_get_bus_estimations`
  - `stopId`: optional public stop number from `paradas_bus["ayto:numero"]`, such as `15`.
  - `lineId`: optional public line number, such as `1` or `24C1`.
  - `limit`: integer from 1 to 100; defaults to 20.

The estimates tool preserves the API's exact signed integer values as `arrival_seconds` and `distance_meters`. Empty second-bus values become `null`; they are not presented as inferred arrival states. Each result includes `source_urls` and `fetched_at`, while each estimate includes `observed_at` and `source_modified_at`.

The official datasets occasionally contain live estimate references that are absent from the stop or line master dataset. Those estimates remain queryable because they are still validated against the live dataset, and the result includes a `warnings` entry instead of silently discarding official data.

The `santander_bus_stop_info` prompt also expects a public stop number. It validates that number against the current API before creating the prompt.

### Identifier semantics

Santander's datasets use two different identifiers:

- `dc:identifier` is the internal API resource ID.
- `ayto:numero` is the public stop or line number.

Tool inputs use public numbers. Internally, line-stop relationships reference a line's `dc:identifier`; the server resolves this mapping from the current `lineas_bus` dataset before filtering. Values such as `ayto:15` are not valid identifiers.

## Validation and failure behavior

- MCP inputs and structured outputs use Zod schemas.
- API envelopes and every known resource field are validated at runtime.
- All pages are fetched, checked for consistent summaries, and deduplicated by `dc:identifier`.
- Invalid JSON, malformed API data, partial pagination, unknown public IDs, timeouts, and non-success HTTP responses fail closed.
- Unknown upstream fields are removed from output until they have an explicit schema.

## Requirements

- Node.js 22 or newer
- npm

## Setup

```bash
npm install
npm run build
npm test
```

Create a `.env` file:

```env
PORT=3000
ALLOWED_HOSTS=localhost,127.0.0.1
OPENAI_APPS_CHALLENGE=replace-with-the-value-from-chatgpt
```

- `PORT` must be an integer from 1 to 65535.
- `ALLOWED_HOSTS` is a comma-separated host list. Entries are normalized to lowercase and must not include a protocol, port, or path.
- `OPENAI_APPS_CHALLENGE` is the domain-verification value supplied during ChatGPT app submission. When set, the server returns it as plain text from `/.well-known/openai-apps-challenge`.

The endpoint is public because it only exposes public, read-only Santander Open Data. It does not request or store user data.

Run in development or production:

```bash
npm run dev
npm run build
npm start
```

The stateless Streamable HTTP endpoint is `POST http://localhost:3000/mcp`. `GET` and `DELETE` return method-not-allowed responses.

## Inspector

```bash
npm run inspect
```

Connect to `http://localhost:3000/mcp`.

## Google Cloud Run

Deploy publicly and set `ALLOWED_HOSTS` to the hostname Cloud Run assigns to the service (without `https://`):

```bash
gcloud run deploy tus-mcp --source . --region europe-west1 --allow-unauthenticated --set-env-vars ALLOWED_HOSTS=YOUR_SERVICE_HOSTNAME --project=PROJECT
```

The MCP endpoint will be `https://YOUR_SERVICE_HOSTNAME/mcp`.

## Docker

```bash
docker build -t tus-mcp .
docker run -p 3000:3000 --env-file .env tus-mcp
```

## Project structure

- `src/index.ts`: validated startup configuration and HTTP listener.
- `src/app.ts`: Express/MCP transport setup.
- `src/config.ts`: Zod-validated environment configuration.
- `src/mcp/`: tools, prompt, and MCP server registration.
- `src/services/`: paginated Santander Open Data access and ID resolution.
- `src/types/`: Zod API/input/output contracts and inferred TypeScript types.
