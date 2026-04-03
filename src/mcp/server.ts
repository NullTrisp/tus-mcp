import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';
import { registerPrompts } from './prompts.js';

export function createServer() {
    const server = new McpServer(
        {
            name: 'tus-mcp-server',
            version: '1.0.0'
        },
        { capabilities: { logging: {} } }
    );

    registerTools(server);
    registerPrompts(server);

    return server;
}
