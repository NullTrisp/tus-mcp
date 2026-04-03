import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { SantanderBusService } from '../services/santander.service.js';

export function registerTools(server: McpServer) {
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
            try {
                const result = await SantanderBusService.getBusStops(limit, search);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
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
                const result = await SantanderBusService.getBusLines(search);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
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
                const result = await SantanderBusService.getBusLineStops(lineId);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
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
                const result = await SantanderBusService.getBusEstimations(stopId, lineId, limit);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
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
}
