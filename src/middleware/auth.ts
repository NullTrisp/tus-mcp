import { NextFunction, Request, Response } from 'express';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!process.env.MCP_TOKEN) {
        console.warn('Warning: MCP_TOKEN is not set in environment variables.');
        return next();
    }

    if (token === process.env.MCP_TOKEN) {
        return next();
    }

    res.status(401).json({
        jsonrpc: '2.0',
        error: {
            code: -32001,
            message: 'Unauthorized: Invalid or missing token.'
        },
        id: null
    });
};
