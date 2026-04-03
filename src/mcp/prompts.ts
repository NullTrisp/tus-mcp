import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';

export function registerPrompts(server: McpServer) {
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
}
