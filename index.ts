import 'dotenv/config';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import { CallToolResult, GetPromptResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types';
import { NextFunction, Request, Response } from 'express';
import * as z from 'zod/v4';

interface BusStop {
    'wgs84_pos:long'?: string;
    'ayto:coordY_ETRS89'?: string;
    'ayto:numero'?: string;
    'gn:coordY'?: string;
    'gn:coordX'?: string;
    'ayto:sentido'?: string;
    'vivo:address1'?: string;
    'ayto:coordX_ETRS89'?: string;
    'dc:modified'?: string;
    'wgs84_pos:lat'?: string;
    'ayto:parada'?: string;
    'dc:identifier'?: string;
    uri?: string;
    [key: string]: any;
}

interface BusStopsResponse {
    summary: {
        items: number;
        items_per_page: number;
        pages: number;
        current_page: number;
    };
    resources: BusStop[];
}

const getServer = () => {
    // Create an MCP server with implementation details
    const server = new McpServer(
        {
            name: 'tus-mcp-server',
            version: '1.0.0'
        },
        { capabilities: { logging: {} } }
    );

    // Register a tool to fetch Santander bus stops
    server.registerTool(
        'get-bus-stops',
        {
            description: 'Get bus stops in Santander from the public API',
            inputSchema: {
                limit: z.number().describe('Maximum number of bus stops to return (default: 10, max: 100)').default(10).optional(),
                search: z.string().describe('Search term to filter bus stops by name or address').optional()
            }
        },
        async ({ limit, search }): Promise<CallToolResult> => {
            const actualLimit = limit || 10;
            try {
                const response = await fetch('https://datos.santander.es/api/rest/datasets/paradas_bus.json');
                if (!response.ok) {
                    throw new Error(`Failed to fetch bus stops: ${response.statusText}`);
                }
                const data = (await response.json()) as BusStopsResponse;
                let ObjectStops: BusStop[] = data.resources || [];

                if (search) {
                    const searchLower = search.toLowerCase();
                    ObjectStops = ObjectStops.filter((stop) =>
                        (stop['ayto:parada'] && String(stop['ayto:parada']).toLowerCase().includes(searchLower)) ||
                        (stop['vivo:address1'] && String(stop['vivo:address1']).toLowerCase().includes(searchLower)) ||
                        (stop['dc:identifier'] && String(stop['dc:identifier']).includes(searchLower))
                    );
                }

                // Limit the number of results
                const limitedStops = ObjectStops.slice(0, Math.min(actualLimit, 100));

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                total_found: ObjectStops.length,
                                returned: limitedStops.length,
                                stops: limitedStops
                            }, null, 2)
                        }
                    ]
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error fetching bus stops: ${error.message}`
                        }
                    ],
                    isError: true
                };
            }
        }
    );

    // Register a prompt to summarize a bus stop
    server.registerPrompt(
        'bus-stop-info',
        {
            description: 'Get a prompt to inquire about a specific bus stop by ID',
            argsSchema: {
                stopId: z.string().describe('The ID of the bus stop (dc:identifier)')
            }
        },
        async ({ stopId }): Promise<GetPromptResult> => {
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Can you please retrieve the information for the Santander bus stop with ID "${stopId}" and summarize its location and details?`
                        }
                    }
                ]
            };
        }
    );
    return server;
};

const app = createMcpExpressApp();

const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!process.env.MCP_TOKEN) {
        console.warn('Warning: MCP_TOKEN is not set in environment variables.');
        return next();
    }

    if (token === process.env.MCP_TOKEN) {
        return next();
    }

    res.status(401).json({
        jsonrpc: '2.0',
        error: {
            code: -32001,
            message: 'Unauthorized: Invalid or missing token.'
        },
        id: null
    });
};

app.use('/mcp', authenticateToken);

app.post('/mcp', async (req: Request, res: Response) => {
    const server = getServer();
    try {
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
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

app.get('/mcp', async (req: Request, res: Response) => {
    console.log('Received GET MCP request');
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.'
            },
            id: null
        })
    );
});

app.delete('/mcp', async (req: Request, res: Response) => {
    console.log('Received DELETE MCP request');
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.'
            },
            id: null
        })
    );
});

// Start the server
const PORT = 3000;
app.listen(PORT, error => {
    if (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
    console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    process.exit(0);
});