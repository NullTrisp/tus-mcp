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

interface BusLine {
    'ayto:numero'?: string;
    'dc:name'?: string;
    'dc:modified'?: string;
    'dc:identifier'?: string;
    uri?: string;
    [key: string]: any;
}

interface BusLineStop {
    'wgs84_pos:long'?: string;
    'gn:coordY'?: string;
    'gn:coordX'?: string;
    'ayto:linea'?: string;
    'dc:modified'?: string;
    'wgs84_pos:lat'?: string;
    'ayto:parada'?: string;
    'dc:identifier'?: string;
    uri?: string;
    [key: string]: any;
}

interface BusEstimation {
    'ayto:tiempo1'?: string;
    'ayto:distancia2'?: string;
    'ayto:destino1'?: string;
    'ayto:distancia1'?: string;
    'ayto:tiempo2'?: string;
    'ayto:paradaId'?: string;
    'ayto:destino2'?: string;
    'ayto:fechActual'?: string;
    'dc:modified'?: string;
    'dc:identifier'?: string;
    'ayto:etiqLinea'?: string;
    uri?: string;
    [key: string]: any;
}

interface ApiResponse<T> {
    summary: {
        items: number;
        items_per_page: number;
        pages: number;
        current_page: number;
    };
    resources: T[];
}

type BusStopsResponse = ApiResponse<BusStop>;
type BusLinesResponse = ApiResponse<BusLine>;
type BusLineStopsResponse = ApiResponse<BusLineStop>;
type BusEstimationsResponse = ApiResponse<BusEstimation>;

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
                let ObjectStops = data.resources || [];

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

    // Register a tool to fetch Santander bus lines
    server.registerTool(
        'get-bus-lines',
        {
            description: 'Get all bus lines in Santander',
            inputSchema: {
                search: z.string().describe('Search term to filter bus lines by name or number').optional()
            }
        },
        async ({ search }): Promise<CallToolResult> => {
            try {
                const response = await fetch('http://datos.santander.es/api/rest/datasets/lineas_bus.json');
                if (!response.ok) {
                    throw new Error(`Failed to fetch bus lines: ${response.statusText}`);
                }
                const data = (await response.json()) as BusLinesResponse;
                let lines = data.resources || [];

                if (search) {
                    const searchLower = search.toLowerCase();
                    lines = lines.filter((line) =>
                        (line['ayto:numero'] && String(line['ayto:numero']).toLowerCase().includes(searchLower)) ||
                        (line['dc:name'] && String(line['dc:name']).toLowerCase().includes(searchLower))
                    );
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                total_found: lines.length,
                                lines: lines
                            }, null, 2)
                        }
                    ]
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error fetching bus lines: ${error.message}`
                        }
                    ],
                    isError: true
                };
            }
        }
    );

    // Register a tool to fetch stops for a specific bus line
    server.registerTool(
        'get-bus-line-stops',
        {
            description: 'Get all stops for a specific bus line in Santander',
            inputSchema: {
                lineId: z.string().describe('The identifier of the bus line (ayto:numero or ayto:linea)')
            }
        },
        async ({ lineId }): Promise<CallToolResult> => {
            try {
                const response = await fetch('http://datos.santander.es/api/rest/datasets/lineas_bus_paradas.json');
                if (!response.ok) {
                    throw new Error(`Failed to fetch bus line stops: ${response.statusText}`);
                }
                const data = (await response.json()) as BusLineStopsResponse;
                let stops = data.resources || [];

                if (lineId) {
                    stops = stops.filter((stop) =>
                        (stop['ayto:linea'] && String(stop['ayto:linea']) === lineId)
                    );
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                line: lineId,
                                total_found: stops.length,
                                stops: stops
                            }, null, 2)
                        }
                    ]
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error fetching bus line stops: ${error.message}`
                        }
                    ],
                    isError: true
                };
            }
        }
    );

    // Register a tool to fetch real-time estimations for a specific stop or line
    server.registerTool(
        'get-bus-estimations',
        {
            description: 'Get real-time arrival estimations for Santander bus stops. Can filter by stop ID or line label.',
            inputSchema: {
                stopId: z.string().describe('The identifier of the bus stop (ayto:paradaId)').optional(),
                lineId: z.string().describe('The label of the bus line (ayto:etiqLinea), e.g., "1", "C1", "24"').optional(),
                limit: z.number().describe('Maximum number of estimations to return').default(20).optional()
            }
        },
        async ({ stopId, lineId, limit }): Promise<CallToolResult> => {
            try {
                // We fetch a larger number of items to ensure we find the stop/line requested
                const response = await fetch('http://datos.santander.es/api/rest/datasets/control_flotas_estimaciones.json?items=1000');
                if (!response.ok) {
                    throw new Error(`Failed to fetch bus estimations: ${response.statusText}`);
                }
                const data = (await response.json()) as BusEstimationsResponse;
                let estimations = data.resources || [];

                if (stopId) {
                    estimations = estimations.filter((estim) =>
                        (estim['ayto:paradaId'] && String(estim['ayto:paradaId']) === stopId)
                    );
                }

                if (lineId) {
                    const lineLower = String(lineId).toLowerCase();
                    estimations = estimations.filter((estim) =>
                        (estim['ayto:etiqLinea'] && String(estim['ayto:etiqLinea']).toLowerCase() === lineLower)
                    );
                }

                // Format the output for better readability
                const formattedEstimations = estimations.map(estim => {
                    const t1Seconds = parseInt(estim['ayto:tiempo1'] || '0');
                    const t2Seconds = parseInt(estim['ayto:tiempo2'] || '0');
                    
                    return {
                        line: estim['ayto:etiqLinea'],
                        stopId: estim['ayto:paradaId'],
                        destinations: {
                            first: estim['ayto:destino1'],
                            second: estim['ayto:destino2']
                        },
                        arrivals: {
                            first_bus: t1Seconds > 0 ? `${Math.round(t1Seconds / 60)} min (${t1Seconds}s)` : 'Arriving/No data',
                            second_bus: t2Seconds > 0 ? `${Math.round(t2Seconds / 60)} min (${t2Seconds}s)` : 'No data'
                        },
                        distances: {
                            first_bus: estim['ayto:distancia1'] ? `${estim['ayto:distancia1']}m` : undefined,
                            second_bus: estim['ayto:distancia2'] ? `${estim['ayto:distancia2']}m` : undefined
                        },
                        timestamp: estim['ayto:fechActual']
                    };
                });

                const finalResults = formattedEstimations.slice(0, limit || 20);

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                filters: { stopId, lineId },
                                total_found: estimations.length,
                                returned: finalResults.length,
                                estimations: finalResults
                            }, null, 2)
                        }
                    ]
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error fetching bus estimations: ${error.message}`
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