import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { SantanderBusService } from '../services/santander.service.js';

export function registerTools(server: McpServer) {
    // Register a tool to fetch Santander bus stops
    server.registerTool(
        'santander_get_bus_stops',
        {
            description: 'Get bus stops in Santander from the public API. Includes name, address, and coordinates.',
            inputSchema: {
                limit: z.number().describe('Maximum number of bus stops to return (default: 10, max: 100)').default(10).optional(),
                search: z.string().describe('Search term to filter bus stops by name, address, or ID').optional()
            }
        },
        async ({ limit, search }): Promise<CallToolResult> => {
            try {
                const result = await SantanderBusService.getBusStops(limit, search);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Found ${result.total_found} bus stops matching your search. Returned ${result.returned} results.`
                        },
                        {
                            type: 'resource',
                            resource: {
                                uri: 'santander://bus/stops',
                                text: JSON.stringify(result, null, 2),
                                mimeType: 'application/json'
                            }
                        }
                    ],
                    annotations: {
                        readOnly: true
                    }
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error fetching bus stops: ${error.message}. Please try again with a different search term or check if the Santander Open Data API is reachable.`
                        }
                    ],
                    isError: true
                };
            }
        }
    );

    // Register a tool to fetch Santander bus lines
    server.registerTool(
        'santander_get_bus_lines',
        {
            description: 'Get all bus lines in Santander, including their numbers and names.',
            inputSchema: {
                search: z.string().describe('Search term to filter bus lines by name or number (e.g., "1", "C1")').optional()
            }
        },
        async ({ search }): Promise<CallToolResult> => {
            try {
                const result = await SantanderBusService.getBusLines(search);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Found ${result.total_found} bus lines. Use the line identifiers (e.g., ayto:numero) to get more details about specific stops.`
                        },
                        {
                            type: 'resource',
                            resource: {
                                uri: 'santander://bus/lines',
                                text: JSON.stringify(result, null, 2),
                                mimeType: 'application/json'
                            }
                        }
                    ],
                    annotations: {
                        readOnly: true
                    }
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error fetching bus lines: ${error.message}.`
                        }
                    ],
                    isError: true
                };
            }
        }
    );

    // Register a tool to fetch stops for a specific bus line
    server.registerTool(
        'santander_get_bus_line_stops',
        {
            description: 'Get all stops served by a specific bus line in Santander.',
            inputSchema: {
                lineId: z.string().describe('The identifier of the bus line (e.g., "ayto:1", "ayto:C1")')
            }
        },
        async ({ lineId }): Promise<CallToolResult> => {
            try {
                const result = await SantanderBusService.getBusLineStops(lineId);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Line ${lineId} serves ${result.total_found} stops. Each stop has an identifier that can be used for real-time estimations.`
                        },
                        {
                            type: 'resource',
                            resource: {
                                uri: `santander://bus/line/${lineId}/stops`,
                                text: JSON.stringify(result, null, 2),
                                mimeType: 'application/json'
                            }
                        }
                    ],
                    annotations: {
                        readOnly: true
                    }
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error fetching bus line stops: ${error.message}. Tip: Ensure the line identifier follows the format found in 'santander_get_bus_lines' (e.g., ayto:1).`
                        }
                    ],
                    isError: true
                };
            }
        }
    );

    // Register a tool to fetch real-time estimations for a specific stop or line
    server.registerTool(
        'santander_get_bus_estimations',
        {
            description: 'Get real-time arrival estimations for Santander bus stops. Provides information on distance and time for the next two buses.',
            inputSchema: {
                stopId: z.string().describe('The identifier of the bus stop (e.g., "ayto:6", "ayto:15")').optional(),
                lineId: z.string().describe('The shorthand label of the bus line (e.g., "1", "C1", "24")').optional(),
                limit: z.number().describe('Maximum number of estimations to return').default(20).optional()
            }
        },
        async ({ stopId, lineId, limit }): Promise<CallToolResult> => {
            try {
                const result = await SantanderBusService.getBusEstimations(stopId, lineId, limit);
                let text = `Found ${result.total_found} real-time estimations.`;
                if (stopId) text += ` Filtered for stop ID ${stopId}.`;
                if (lineId) text += ` Filtered for line ${lineId}.`;

                return {
                    content: [
                        {
                            type: 'text',
                            text: text
                        },
                        {
                            type: 'resource',
                            resource: {
                                uri: `santander://bus/estimations?stop=${stopId || ''}&line=${lineId || ''}`,
                                text: JSON.stringify(result, null, 2),
                                mimeType: 'application/json'
                            }
                        }
                    ],
                    annotations: {
                        readOnly: true
                    }
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error fetching bus estimations: ${error.message}. If you provided a stopId, ensure it is a valid integer string (e.g., "15").`
                        }
                    ],
                    isError: true
                };
            }
        }
    );
}
