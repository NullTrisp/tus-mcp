import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { SantanderBusService } from '../services/santander.service.js';
import { busStopLookupInputSchema } from '../types/bus.js';

export function registerPrompts(server: McpServer) {
    server.registerPrompt(
        'santander_bus_stop_info',
        {
            description: 'Create a prompt for a bus stop after validating its public number with Santander Open Data',
            argsSchema: busStopLookupInputSchema.shape
        },
        async ({ stopId }): Promise<GetPromptResult> => {
            const stop = await SantanderBusService.getBusStop(stopId);
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: [
                                'Summarize this bus stop validated against the Santander Open Data API:',
                                `Public stop number: ${stop['ayto:numero']}`,
                                `API resource ID: ${stop['dc:identifier']}`,
                                `Name: ${stop['ayto:parada']}`,
                                `Address: ${stop['vivo:address1']}`,
                                `Direction: ${stop['ayto:sentido']}`,
                                `Coordinates: ${stop['wgs84_pos:lat']}, ${stop['wgs84_pos:long']}`,
                                `Source modified at: ${stop['dc:modified']}`,
                                `Use santander_get_bus_estimations with stopId "${stop['ayto:numero']}" for the latest published estimates.`
                            ].join('\n')
                        }
                    }
                ]
            };
        }
    );
}
