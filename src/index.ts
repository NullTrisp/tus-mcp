import 'dotenv/config';
import { createApp } from './app.js';

const app = createApp();

const PORT = parseInt(process.env.PORT || '3000');

app.listen(PORT, '0.0.0.0', (error?: Error) => {
    if (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
    console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});

// Handle server shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    process.exit(0);
});
