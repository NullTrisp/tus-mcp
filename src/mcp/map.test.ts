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
    const positionsMapTool = tools.tools.find((tool) => tool.name === 'santander_render_bus_positions_map');
    const rechargeMapTool = tools.tools.find((tool) => tool.name === 'santander_render_tus_recharge_points_map');
    const tuebiciMapTool = tools.tools.find((tool) => tool.name === 'santander_render_tuebici_stations_map');
    const uiMetadata = mapTool?._meta?.ui as { resourceUri?: string } | undefined;
    const linesUiMetadata = linesMapTool?._meta?.ui as { resourceUri?: string } | undefined;
    const positionsUiMetadata = positionsMapTool?._meta?.ui as { resourceUri?: string } | undefined;
    const rechargeUiMetadata = rechargeMapTool?._meta?.ui as { resourceUri?: string } | undefined;
    const tuebiciUiMetadata = tuebiciMapTool?._meta?.ui as { resourceUri?: string } | undefined;
    assert.equal(uiMetadata?.resourceUri, 'ui://santander/bus-map-v8.html');
    assert.equal(linesUiMetadata?.resourceUri, 'ui://santander/bus-map-v8.html');
    assert.equal(positionsUiMetadata?.resourceUri, 'ui://santander/bus-map-v8.html');
    assert.equal(rechargeUiMetadata?.resourceUri, 'ui://santander/bus-map-v8.html');
    assert.equal(tuebiciUiMetadata?.resourceUri, 'ui://santander/bus-map-v8.html');

    const resource = await client.readResource({ uri: 'ui://santander/bus-map-v8.html' });
    assert.equal(resource.contents[0]?.mimeType, 'text/html;profile=mcp-app');
    const resourceMetadata = resource.contents[0]?._meta?.ui as { domain?: string } | undefined;
    assert.equal(resourceMetadata?.domain, 'https://widgets.example.com');
    assert.match('text' in resource.contents[0]! ? resource.contents[0].text : '', /OpenStreetMap/);
    assert.match('text' in resource.contents[0]! ? resource.contents[0].text : '', /L\.polyline/);
    assert.match('text' in resource.contents[0]! ? resource.contents[0].text : '', /route\.direction === '1' \? 'Ida'/);

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
                routes: [{
                    route_id: '10',
                    direction: '1',
                    name: 'Outbound',
                    stops: [
                        { stopId: '15', name: 'First', sequence: 1, distance_meters: 0, latitude: 43.4623, longitude: -3.8099 },
                        { stopId: '16', name: 'Second', sequence: 2, distance_meters: 500, latitude: 43.465, longitude: -3.805 }
                    ]
                }]
            }]
        }
    });
    assert.deepEqual(linesResult.structuredContent, {
        title: 'Test line',
        lines: [{
            id: '1',
            name: 'Test route',
            routes: [{
                route_id: '10',
                direction: '1',
                name: 'Outbound',
                stops: [
                    { stopId: '15', name: 'First', sequence: 1, distance_meters: 0, latitude: 43.4623, longitude: -3.8099 },
                    { stopId: '16', name: 'Second', sequence: 2, distance_meters: 500, latitude: 43.465, longitude: -3.805 }
                ]
            }]
        }]
    });

    const positionsResult = await client.callTool({
        name: 'santander_render_bus_positions_map',
        arguments: {
            title: 'Recent buses',
            positions: [{
                vehicleId: '9001',
                line: '1',
                line_name: 'Centro',
                latitude: 43.4623,
                longitude: -3.8099,
                speed_kmh: 20,
                observed_at: '2026-08-22T12:00:00.000Z',
                vehicle: { fuel: 'HIBRIDO', total_capacity: 90 }
            }]
        }
    });
    assert.deepEqual(positionsResult.structuredContent, {
        title: 'Recent buses',
        positions: [{
            vehicleId: '9001',
            line: '1',
            line_name: 'Centro',
            latitude: 43.4623,
            longitude: -3.8099,
            speed_kmh: 20,
            observed_at: '2026-08-22T12:00:00.000Z',
            vehicle: { fuel: 'HIBRIDO', total_capacity: 90 }
        }]
    });

    const rechargeResult = await client.callTool({
        name: 'santander_render_tus_recharge_points_map',
        arguments: {
            title: 'Recharge points',
            points: [{
                name: 'Estanco Centro',
                vendor_type: 'Estanco',
                address: 'Calle Centro 1',
                postcode: '39001',
                town: 'Santander',
                latitude: 43.4623,
                longitude: -3.8099
            }]
        }
    });
    assert.deepEqual(rechargeResult.structuredContent, {
        title: 'Recharge points',
        points: [{
            name: 'Estanco Centro',
            vendor_type: 'Estanco',
            address: 'Calle Centro 1',
            postcode: '39001',
            town: 'Santander',
            latitude: 43.4623,
            longitude: -3.8099
        }]
    });

    const tuebiciResult = await client.callTool({
        name: 'santander_render_tuebici_stations_map',
        arguments: {
            title: 'TUeBICI availability',
            stations: [{
                stationId: '1',
                short_name: '37400',
                name: 'Sardinero',
                latitude: 43.477,
                longitude: -3.791,
                capacity: 20,
                bikes_available: 6,
                docks_available: 9,
                is_renting: true,
                is_returning: true,
                last_reported_at: '2026-08-23T06:56:15.000Z'
            }]
        }
    });
    assert.deepEqual(tuebiciResult.structuredContent, {
        title: 'TUeBICI availability',
        stations: [{
            stationId: '1',
            short_name: '37400',
            name: 'Sardinero',
            latitude: 43.477,
            longitude: -3.791,
            capacity: 20,
            bikes_available: 6,
            docks_available: 9,
            is_renting: true,
            is_returning: true,
            last_reported_at: '2026-08-23T06:56:15.000Z'
        }]
    });
});
