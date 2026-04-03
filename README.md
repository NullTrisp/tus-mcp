# TUS Santander MCP Server

[![MCP](https://img.shields.io/badge/MCP-SDK-blue)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.x-green)](https://expressjs.com/)

An MCP (Model Context Protocol) server that provides real-time access to Santander's Public Transport (TUS - Transporte Urbano de Santander) Open Data. This server allows AI assistants like Claude or Cursor to query bus stops, lines, and real-time arrival estimations.

## 🚀 Features

The server implements several tools and a prompt to interact with the Santander Open Data API:

### Tools

*   **`get-bus-stops`**: Retrieves bus stops in Santander.
    *   `limit`: (Optional) Maximum number of stops to return (default: 10, max: 100).
    *   `search`: (Optional) Filter by name, address, or identifier.
*   **`get-bus-lines`**: Lists all available bus lines.
    *   `search`: (Optional) Filter by line number or name.
*   **`get-bus-line-stops`**: Gets all stops associated with a specific bus line.
    *   `lineId`: (Required) The line identifier (e.g., "1", "C1", "24").
*   **`get-bus-estimations`**: Provides real-time arrival estimations for a stop or line.
    *   `stopId`: (Optional) Filter by stop identifier.
    *   `lineId`: (Optional) Filter by line label.
    *   `limit`: (Optional) Maximum results (default: 20).

### Prompts

*   **`bus-stop-info`**: A pre-configured prompt to ask for detailed information about a specific bus stop by its ID.

## 🛠️ Prerequisites

*   [Node.js](https://nodejs.org/) (v22 or higher recommended)
*   [npm](https://www.npmjs.com/)
*   (Optional) [Docker](https://www.docker.com/) for containerized deployment.

## 📦 Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/tus-mcp.git
    cd tus-mcp
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Build the project:
    ```bash
    npm run build
    ```

## ⚙️ Configuration

Create a `.env` file in the root directory (you can use the provided `.env` if it exists):

```env
PORT=3000
MCP_TOKEN=your_secure_token_here
ALLOWED_HOSTS=host1,host2,host3
```

*   `PORT`: The port the server will listen on (default: 3000).
*   `MCP_TOKEN`: A security token for authenticating requests to `/mcp`. If not set, authentication is skipped (not recommended for public deployment).
*   `ALLOWED_HOSTS`: A comma-separated list of allowed hosts for the MCP server.

## 🏃 Running the Server

### Local Development

Run the server in development mode (with auto-reload):
```bash
npm run dev
```

Run the compiled server:
```bash
npm run start
```

### Docker

Build the image:
```bash
docker build -t tus-mcp .
```

Run the container:
```bash
docker run -p 3000:3000 --env-file .env tus-mcp
```

### Deployment to Google Cloud Run

To deploy directly to Google Cloud Run:
```bash
gcloud run deploy tus-mcp --source . --region europe-west1 --allow-unauthenticated --set-env-vars MCP_TOKEN=token --set-env-vars ALLOWED_HOSTS=host --project=tus-mcp --port 3000 --project=project-id
```

## 🔌 Integrating with AI Clients

### Claude Desktop (config.json)

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tus-mcp": {
      "command": "node",
      "args": ["/path/to/tus-mcp/dist/src/index.js"],
      "env": {
        "MCP_TOKEN": "your_secure_token_here",
        "PORT": "3000"
      }
    }
  }
}
```

### HTTP Transport (Streaming)

The server uses `StreamableHTTPServerTransport`. You can connect via HTTP POST to `http://localhost:3000/mcp` using a client that supports MCP over HTTP.

## 📁 Project Structure

*   `src/index.ts`: Main entry point, starts the Express server.
*   `src/app.ts`: Express application setup and routes.
*   `src/services/`: External API integration logic (Santander Open Data).
*   `src/mcp/`: MCP definitions (tools, prompts, server factory).
*   `src/middleware/`: Express middlewares (authentication).
*   `src/types/`: TypeScript interfaces and types.
*   `Dockerfile`: Multi-stage build for production-ready containerization.
*   `tsconfig.json`: TypeScript configuration.
*   `dist/`: Compiled JavaScript output.

## 📜 License

This project is open-source. Please check the data usage policies of [Santander Open Data](https://datos.santander.es/).
