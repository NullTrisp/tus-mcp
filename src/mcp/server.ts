import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBusMap } from './map.js';
import { registerTools } from './tools.js';
import { registerPrompts } from './prompts.js';

export function createServer(widgetDomain = 'https://localhost') {
    const server = new McpServer(
        {
            name: 'tus-mcp-server',
            version: '1.0.0'
        },
        { capabilities: { logging: {} } }
    );

    registerTools(server);
    registerBusMap(server, widgetDomain);
    registerPrompts(server);

    return server;
}
