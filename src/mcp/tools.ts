import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SantanderBusService } from '../services/santander.service.js';
import {
    busEstimationsInputSchema,
    busEstimationsResultSchema,
    busLinesInputSchema,
    busLinesResultSchema,
    busLineStopsInputSchema,
    busLineStopsResultSchema,
    busStopsInputSchema,
    busStopsResultSchema
} from '../types/bus.js';

const readOnlyAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false
} as const;

function successResult<T extends Record<string, unknown>>(
    summary: string,
    uri: string,
    result: T
): CallToolResult {
    return {
        content: [
            { type: 'text', text: summary },
            {
                type: 'resource',
                resource: {
                    uri,
                    text: JSON.stringify(result, null, 2),
                    mimeType: 'application/json'
                }
            }
        ],
        structuredContent: result
    };
}

function errorResult(action: string, error: unknown): CallToolResult {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return {
        content: [{ type: 'text', text: `Unable to ${action}: ${message}` }],
        isError: true
    };
}

export function registerTools(server: McpServer) {
    server.registerTool(
        'santander_get_bus_stops',
        {
            description: 'Get current Santander bus stops from the official Open Data API.',
            inputSchema: busStopsInputSchema,
            outputSchema: busStopsResultSchema,
            annotations: readOnlyAnnotations
        },
        async ({ limit, search }): Promise<CallToolResult> => {
            try {
                const result = await SantanderBusService.getBusStops(limit, search);
                return successResult(
                    `Found ${result.total_found} matching bus stops; returned ${result.returned}.`,
                    'santander://bus/stops',
                    result
                );
            } catch (error: unknown) {
                return errorResult('fetch bus stops from Santander Open Data', error);
            }
        }
    );

    server.registerTool(
        'santander_get_bus_lines',
        {
            description: 'Get current Santander bus lines from the official Open Data API.',
            inputSchema: busLinesInputSchema,
            outputSchema: busLinesResultSchema,
            annotations: readOnlyAnnotations
        },
        async ({ search }): Promise<CallToolResult> => {
            try {
                const result = await SantanderBusService.getBusLines(search);
                return successResult(
                    `Found ${result.total_found} bus lines. Use ayto:numero as the public line number.`,
                    'santander://bus/lines',
                    result
                );
            } catch (error: unknown) {
                return errorResult('fetch bus lines from Santander Open Data', error);
            }
        }
    );

    server.registerTool(
        'santander_get_bus_line_stops',
        {
            description: 'Get every stop relationship for a current Santander bus line.',
            inputSchema: busLineStopsInputSchema,
            outputSchema: busLineStopsResultSchema,
            annotations: readOnlyAnnotations
        },
        async ({ lineId }): Promise<CallToolResult> => {
            try {
                const result = await SantanderBusService.getBusLineStops(lineId);
                return successResult(
                    `Line ${result.line} (${result.line_name}) serves ${result.total_found} stop relationships.`,
                    `santander://bus/line/${encodeURIComponent(result.line)}/stops`,
                    result
                );
            } catch (error: unknown) {
                return errorResult('fetch bus line stops from Santander Open Data', error);
            }
        }
    );

    server.registerTool(
        'santander_get_bus_estimations',
        {
            description: 'Get the latest arrival estimates published by Santander Open Data.',
            inputSchema: busEstimationsInputSchema,
            outputSchema: busEstimationsResultSchema,
            annotations: readOnlyAnnotations
        },
        async ({ stopId, lineId, limit }): Promise<CallToolResult> => {
            try {
                const result = await SantanderBusService.getBusEstimations(stopId, lineId, limit);
                const query = new URLSearchParams({
                    ...(result.filters.stopId && { stop: result.filters.stopId }),
                    ...(result.filters.lineId && { line: result.filters.lineId })
                }).toString();
                const warningText = result.warnings.length ? ` Warnings: ${result.warnings.join(' ')}` : '';
                return successResult(
                    `Found ${result.total_found} published arrival estimates; returned ${result.returned}.${warningText}`,
                    `santander://bus/estimations${query ? `?${query}` : ''}`,
                    result
                );
            } catch (error: unknown) {
                return errorResult('fetch bus arrival estimates from Santander Open Data', error);
            }
        }
    );
}
