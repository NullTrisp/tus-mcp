import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from './app.js';

test('serves MCP publicly without authorization', async (t) => {
    const app = createApp({
        port: 3000,
        openaiAppsChallenge: 'test-challenge',
        allowedHosts: ['127.0.0.1']
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    t.after(() => new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));

    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, {
        method: 'POST',
        headers: {
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'public-access-test', version: '1.0.0' }
            }
        })
    });

    assert.equal(response.status, 200);

    const challengeResponse = await fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/.well-known/openai-apps-challenge`
    );
    assert.equal(challengeResponse.status, 200);
    assert.equal(challengeResponse.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(await challengeResponse.text(), 'test-challenge');
});
