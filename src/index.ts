import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp(config);

const httpServer = app.listen(config.port, '0.0.0.0');
httpServer.on('listening', () => {
    console.log(`MCP Stateless Streamable HTTP Server listening on port ${config.port}`);
});
httpServer.on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

const shutdown = () => {
    console.log('Shutting down server...');
    httpServer.close((error) => process.exit(error ? 1 : 0));
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
