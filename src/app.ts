import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response } from 'express';
import { createServer } from './mcp/server.js';
import { authenticateToken } from './middleware/auth.js';

export function createApp() {
    const allowedHosts = process.env.ALLOWED_HOSTS?.split(',') || ['localhost', '127.0.0.1'];
    const app = createMcpExpressApp({
        host: '0.0.0.0',
        allowedHosts
    });

    app.use('/mcp', authenticateToken);

    app.post('/mcp', async (req: Request, res: Response) => {
        const server = createServer();
        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined
            });
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);

            res.on('close', () => {
                console.log('Request closed');
                transport.close();
                server.close();
            });
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
