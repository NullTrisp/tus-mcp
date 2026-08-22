import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.js';

test('registers the bus-stop map resource and returns renderable stop data', async (context) => {
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
    const uiMetadata = mapTool?._meta?.ui as { resourceUri?: string } | undefined;
    assert.equal(uiMetadata?.resourceUri, 'ui://santander/bus-stops-map-v2.html');

    const resource = await client.readResource({ uri: 'ui://santander/bus-stops-map-v2.html' });
    assert.equal(resource.contents[0]?.mimeType, 'text/html;profile=mcp-app');
    const resourceMetadata = resource.contents[0]?._meta?.ui as { domain?: string } | undefined;
    assert.equal(resourceMetadata?.domain, 'https://widgets.example.com');
    assert.match('text' in resource.contents[0]! ? resource.contents[0].text : '', /OpenStreetMap/);

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
});
