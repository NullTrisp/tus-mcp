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
    busStopsResultSchema,
    recentBusPositionsInputSchema,
    recentBusPositionsResultSchema,
    tusRechargePointsInputSchema,
    tusRechargePointsResultSchema,
    tuebiciStationsInputSchema,
    tuebiciStationsResultSchema,
    nearbyInputSchema,
    nearbyTuebiciInputSchema,
    nearbyBusStopsResultSchema,
    nearbyTusRechargePointsResultSchema,
    nearbyTuebiciStationsResultSchema,
    userLocationSchema
} from '../types/bus.js';

const readOnlyAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false
} as const;

function successResult<T extends Record<string, unknown>>(
    summary: string,
    result: T
): CallToolResult {
    return {
        content: [{ type: 'text', text: summary }],
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

function userLocation(meta: Record<string, unknown> | undefined, latitude?: number, longitude?: number) {
    const parsed = userLocationSchema.safeParse(
        latitude === undefined ? meta?.['openai/userLocation'] : { latitude, longitude }
    );
    if (!parsed.success) {
        throw new Error('Location is unavailable. Allow ChatGPT location access or provide latitude and longitude.');
    }
    return parsed.data;
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
                    result
                );
            } catch (error: unknown) {
                return errorResult('fetch bus stops from Santander Open Data', error);
            }
        }
    );

    server.registerTool(
        'santander_get_nearby_bus_stops',
        {
            description: 'Find Santander bus stops nearest to the user\'s current approximate location.',
            inputSchema: nearbyInputSchema,
            outputSchema: nearbyBusStopsResultSchema,
            annotations: readOnlyAnnotations
        },
        async ({ limit, radiusMeters, latitude, longitude }, { _meta }): Promise<CallToolResult> => {
            try {
                const location = userLocation(_meta, latitude, longitude);
                const result = await SantanderBusService.getNearbyBusStops(
                    location.latitude,
                    location.longitude,
                    limit,
                    radiusMeters
                );
                return successResult(
                    `Found ${result.total_found} bus stops within ${result.radius_meters} meters; returned ${result.returned}.`,
                    result
                );
            } catch (error: unknown) {
                return errorResult('find nearby Santander bus stops', error);
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
                    `Line ${result.line} (${result.line_name}) serves ${result.total_found} stop relationships across ${result.routes.length} ordered routes.`,
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
                const warningText = result.warnings.length ? ` Warnings: ${result.warnings.join(' ')}` : '';
                return successResult(
                    `Found ${result.total_found} published arrival estimates; returned ${result.returned}.${warningText}`,
                    result
                );
            } catch (error: unknown) {
                return errorResult('fetch bus arrival estimates from Santander Open Data', error);
            }
        }
    );

    server.registerTool(
        'santander_get_recent_bus_positions',
        {
            description: 'Get the most recent published position of each active Santander bus, optionally filtered by public line number. Vehicle capacity and fuel data are included when available.',
            inputSchema: recentBusPositionsInputSchema,
            outputSchema: recentBusPositionsResultSchema,
            annotations: readOnlyAnnotations
        },
        async ({ lineId, maxAgeMinutes }): Promise<CallToolResult> => {
            try {
                const result = await SantanderBusService.getRecentBusPositions(lineId, maxAgeMinutes);
                return successResult(
                    `Found ${result.returned} buses from ${result.total_observations} position observations published within the last ${result.filters.maxAgeMinutes} minutes.`,
                    result
                );
            } catch (error: unknown) {
                return errorResult('fetch recent bus positions from Santander Open Data', error);
            }
        }
    );

    server.registerTool(
        'santander_get_tus_recharge_points',
        {
            description: 'Find official TUS card sale and recharge points by name, address, postcode, town, or vendor type.',
            inputSchema: tusRechargePointsInputSchema,
            outputSchema: tusRechargePointsResultSchema,
            annotations: readOnlyAnnotations
        },
        async ({ limit, search }): Promise<CallToolResult> => {
            try {
                const result = await SantanderBusService.getTusRechargePoints(limit, search);
                return successResult(
                    `Found ${result.total_found} matching TUS recharge points; returned ${result.returned}.`,
                    result
                );
            } catch (error: unknown) {
                return errorResult('fetch TUS recharge points from Santander Open Data', error);
            }
        }
    );

    server.registerTool(
        'santander_get_nearby_tus_recharge_points',
        {
            description: 'Find official TUS card sale and recharge points nearest to the user\'s current approximate location.',
            inputSchema: nearbyInputSchema,
            outputSchema: nearbyTusRechargePointsResultSchema,
            annotations: readOnlyAnnotations
        },
        async ({ limit, radiusMeters, latitude, longitude }, { _meta }): Promise<CallToolResult> => {
            try {
                const location = userLocation(_meta, latitude, longitude);
                const result = await SantanderBusService.getNearbyTusRechargePoints(
                    location.latitude,
                    location.longitude,
                    limit,
                    radiusMeters
                );
                return successResult(
                    `Found ${result.total_found} TUS recharge points within ${result.radius_meters} meters; returned ${result.returned}.`,
                    result
                );
            } catch (error: unknown) {
                return errorResult('find nearby TUS recharge points', error);
            }
        }
    );

    server.registerTool(
        'santander_get_tuebici_stations',
        {
            description: 'Get current TUeBICI electric-bike stations and availability from the official operator GBFS feed.',
            inputSchema: tuebiciStationsInputSchema,
            outputSchema: tuebiciStationsResultSchema,
            annotations: readOnlyAnnotations
        },
        async ({ limit, search, onlyAvailable }): Promise<CallToolResult> => {
            try {
                const result = await SantanderBusService.getTuebiciStations(limit, search, onlyAvailable);
                return successResult(
                    `Found ${result.total_found} matching TUeBICI stations; returned ${result.returned}.`,
                    result
                );
            } catch (error: unknown) {
                return errorResult('fetch TUeBICI stations and availability', error);
            }
        }
    );

    server.registerTool(
        'santander_get_nearby_tuebici_stations',
        {
            description: 'Find TUeBICI stations nearest to the user\'s current approximate location, with current availability.',
            inputSchema: nearbyTuebiciInputSchema,
            outputSchema: nearbyTuebiciStationsResultSchema,
            annotations: readOnlyAnnotations
        },
        async ({ limit, radiusMeters, latitude, longitude, onlyAvailable }, { _meta }): Promise<CallToolResult> => {
            try {
                const location = userLocation(_meta, latitude, longitude);
                const result = await SantanderBusService.getNearbyTuebiciStations(
                    location.latitude,
                    location.longitude,
                    limit,
                    radiusMeters,
                    onlyAvailable
                );
                return successResult(
                    `Found ${result.total_found} TUeBICI stations within ${result.radius_meters} meters; returned ${result.returned}.`,
                    result
                );
            } catch (error: unknown) {
                return errorResult('find nearby TUeBICI stations', error);
            }
        }
    );
}
