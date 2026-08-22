import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response } from 'express';
import { loadConfig, RuntimeConfig } from './config.js';
import { createServer } from './mcp/server.js';

export function createApp(config: RuntimeConfig = loadConfig()) {
    const app = createMcpExpressApp({
        host: '0.0.0.0',
        allowedHosts: config.allowedHosts
    });

    if (config.openaiAppsChallenge) {
        app.get('/.well-known/openai-apps-challenge', (_req: Request, res: Response) => {
            res.type('text/plain').send(config.openaiAppsChallenge);
        });
    }

    app.post('/mcp', async (req: Request, res: Response) => {
        const server = createServer();
        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined
            });
            res.once('close', () => {
                void transport.close();
                void server.close();
            });
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            console.error('Error handling MCP request:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error'
                    },
                    id: null
                });
            }
        }
    });

    app.get('/mcp', (req: Request, res: Response) => {
        res.status(405).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.'
            },
            id: null
        });
    });

    app.delete('/mcp', (req: Request, res: Response) => {
        res.status(405).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.'
            },
            id: null
        });
    });

    return app;
}
