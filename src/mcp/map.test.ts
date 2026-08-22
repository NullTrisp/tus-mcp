import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.js';

test('registers the bus map resource and returns renderable stop and line data', async (context) => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createServer('https://widgets.example.com');
    const client = new Client({ name: 'map-test', version: '1.0.0' });
    context.after(async () => {
        await client.close();
        await server.close();
    });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    const mapTool = tools.tools.find((tool) => tool.name === 'santander_render_bus_stops_map');
    const linesMapTool = tools.tools.find((tool) => tool.name === 'santander_render_bus_lines_map');
    const uiMetadata = mapTool?._meta?.ui as { resourceUri?: string } | undefined;
    const linesUiMetadata = linesMapTool?._meta?.ui as { resourceUri?: string } | undefined;
    assert.equal(uiMetadata?.resourceUri, 'ui://santander/bus-map-v4.html');
    assert.equal(linesUiMetadata?.resourceUri, 'ui://santander/bus-map-v4.html');

    const resource = await client.readResource({ uri: 'ui://santander/bus-map-v4.html' });
    assert.equal(resource.contents[0]?.mimeType, 'text/html;profile=mcp-app');
    const resourceMetadata = resource.contents[0]?._meta?.ui as { domain?: string } | undefined;
    assert.equal(resourceMetadata?.domain, 'https://widgets.example.com');
    assert.match('text' in resource.contents[0]! ? resource.contents[0].text : '', /OpenStreetMap/);
    assert.doesNotMatch('text' in resource.contents[0]! ? resource.contents[0].text : '', /L\.polyline/);

    const result = await client.callTool({
        name: 'santander_render_bus_stops_map',
        arguments: {
            title: 'Test stops',
            stops: [{
                id: '15',
                name: 'Test stop',
                latitude: 43.4623,
                longitude: -3.8099
            }]
        }
    });
    assert.deepEqual(result.structuredContent, {
        title: 'Test stops',
        stops: [{
            id: '15',
            name: 'Test stop',
            latitude: 43.4623,
            longitude: -3.8099
        }]
    });

    const linesResult = await client.callTool({
        name: 'santander_render_bus_lines_map',
        arguments: {
            title: 'Test line',
            lines: [{
                id: '1',
                name: 'Test route',
                stops: [
                    { id: '15', latitude: 43.4623, longitude: -3.8099 },
                    { id: '16', latitude: 43.465, longitude: -3.805 }
                ]
            }]
        }
    });
    assert.deepEqual(linesResult.structuredContent, {
        title: 'Test line',
        lines: [{
            id: '1',
            name: 'Test route',
            stops: [
                { id: '15', latitude: 43.4623, longitude: -3.8099 },
                { id: '16', latitude: 43.465, longitude: -3.805 }
            ]
        }]
    });
});
