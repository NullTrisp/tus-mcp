import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';

const mapUri = 'ui://santander/bus-map-v4.html';
const readOnlyAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false
} as const;

const mapStopSchema = z.object({
    id: z.string().min(1).describe('Public stop number or stable stop identifier'),
    name: z.string().min(1).describe('Stop name shown on the map'),
    address: z.string().optional().describe('Optional stop address or direction'),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
});

const busStopsMapSchema = z.object({
    title: z.string().min(1).max(100).default('Santander bus stops'),
    stops: z.array(mapStopSchema).min(1).max(100)
});

const mapLineStopSchema = z.object({
    id: z.string().min(1).describe('Public stop number or stable stop identifier'),
    name: z.string().min(1).optional().describe('Optional stop name shown on the map'),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
});

const busLinesMapSchema = z.object({
    title: z.string().min(1).max(100).default('Santander bus lines'),
    lines: z.array(z.object({
        id: z.string().min(1).describe('Public bus-line number'),
        name: z.string().min(1).describe('Bus-line name or destination'),
        stops: z.array(mapLineStopSchema).min(2).max(100)
    })).min(1).max(10)
});

const mapHtml = String.raw`<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <style>
        :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
        body { margin: 0; background: Canvas; color: CanvasText; }
        header { align-items: center; display: flex; gap: 12px; justify-content: space-between; padding: 10px 12px; }
        h1 { font-size: 16px; margin: 0; }
        button { background: ButtonFace; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); border-radius: 8px; color: ButtonText; cursor: pointer; padding: 6px 10px; }
        #map { height: min(62vh, 520px); min-height: 320px; width: 100%; }
        #empty { padding: 32px; text-align: center; }
        .leaflet-popup-content strong, .leaflet-popup-content span { display: block; }
    </style>
</head>
<body>
    <header>
        <h1 id="title">Santander bus stops</h1>
        <button id="fullscreen" type="button">Fullscreen</button>
    </header>
    <div id="empty">Waiting for bus-stop data…</div>
    <div id="map" hidden></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        const title = document.getElementById('title');
        const empty = document.getElementById('empty');
        const mapElement = document.getElementById('map');
        const fullscreen = document.getElementById('fullscreen');
        const map = L.map(mapElement);
        const layers = L.layerGroup().addTo(map);
        const lineColors = ['#0066cc', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#008b8b', '#c2185b', '#6d4c41', '#455a64', '#7cb342'];

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        function popupContent(stop, line) {
            const container = document.createElement('div');
            const heading = document.createElement('strong');
            const details = document.createElement('span');
            heading.textContent = stop.name || 'Stop ' + stop.id;
            details.textContent = [line && 'Line ' + line.id, stop.id && 'Stop ' + stop.id, stop.address].filter(Boolean).join(' · ');
            container.append(heading, details);
            return container;
        }

        function render(data) {
            const hasStops = Array.isArray(data?.stops) && data.stops.length > 0;
            const hasLines = Array.isArray(data?.lines) && data.lines.length > 0;
            if (!hasStops && !hasLines) return;
            title.textContent = data.title || (hasLines ? 'Santander bus lines' : 'Santander bus stops');
            layers.clearLayers();
            const bounds = [];
            if (hasLines) {
                data.lines.forEach((line, index) => {
                    const color = lineColors[index % lineColors.length];
                    line.stops.forEach((stop) => {
                        const point = [stop.latitude, stop.longitude];
                        L.circleMarker(point, {
                            color,
                            fillColor: color,
                            fillOpacity: 0.9,
                            radius: 4,
                            weight: 2
                        }).bindPopup(popupContent(stop, line)).addTo(layers);
                        bounds.push(point);
                    });
                });
            } else {
                for (const stop of data.stops) {
                    const point = [stop.latitude, stop.longitude];
                    L.marker(point).bindPopup(popupContent(stop)).addTo(layers);
                    bounds.push(point);
                }
            }
            empty.hidden = true;
            mapElement.hidden = false;
            map.invalidateSize();
            map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
        }

        window.addEventListener('message', (event) => {
            if (event.source !== window.parent) return;
            const message = event.data;
            if (message?.method === 'ui/notifications/tool-result') {
                render(message.params?.structuredContent);
            }
        }, { passive: true });

        if (window.openai?.toolOutput) render(window.openai.toolOutput);
        fullscreen.hidden = !window.openai?.requestDisplayMode;
        fullscreen.addEventListener('click', () => window.openai?.requestDisplayMode?.({ mode: 'fullscreen' }));
    </script>
</body>
</html>`;

export function registerBusMap(server: McpServer, widgetDomain: string) {
    registerAppResource(
        server,
        'Santander bus map',
        mapUri,
        { description: 'Interactive map used by the Santander bus-stop and bus-line renderers.' },
        async () => ({
            contents: [{
                uri: mapUri,
                mimeType: RESOURCE_MIME_TYPE,
                text: mapHtml,
                _meta: {
                    ui: {
                        prefersBorder: true,
                        domain: widgetDomain,
                        csp: {
                            resourceDomains: [
                                'https://unpkg.com',
                                'https://tile.openstreetmap.org'
                            ]
                        }
                    }
                }
            }]
        })
    );

    server.registerTool(
        'santander_render_bus_stops_map',
        {
            title: 'Show Santander bus stops on a map',
            description: 'Render selected Santander bus stops on an interactive map. First call santander_get_bus_stops or santander_get_bus_line_stops, then pass the chosen stops with numeric WGS84 coordinates.',
            inputSchema: busStopsMapSchema,
            outputSchema: busStopsMapSchema,
            annotations: readOnlyAnnotations,
            _meta: {
                ui: { resourceUri: mapUri },
                'openai/toolInvocation/invoking': 'Preparing the bus-stop map…',
                'openai/toolInvocation/invoked': 'Bus-stop map ready.'
            }
        },
        async ({ title, stops }) => ({
            structuredContent: { title, stops },
            content: [{
                type: 'text',
                text: `Showing ${stops.length} Santander bus ${stops.length === 1 ? 'stop' : 'stops'} on the map.`
            }]
        })
    );

    server.registerTool(
        'santander_render_bus_lines_map',
        {
            title: 'Show Santander bus-line stops on a map',
            description: 'Render the stops served by up to 10 Santander bus lines, using a distinct marker color for each line. First call santander_get_bus_line_stops for each line, then pass numeric WGS84 coordinates. Stops are not joined because the source does not provide route geometry.',
            inputSchema: busLinesMapSchema,
            outputSchema: busLinesMapSchema,
            annotations: readOnlyAnnotations,
            _meta: {
                ui: { resourceUri: mapUri },
                'openai/toolInvocation/invoking': 'Preparing the bus-line map…',
                'openai/toolInvocation/invoked': 'Bus-line map ready.'
            }
        },
        async ({ title, lines }) => ({
            structuredContent: { title, lines },
            content: [{
                type: 'text',
                text: `Showing ${lines.length} Santander bus ${lines.length === 1 ? 'line' : 'lines'} on the map.`
            }]
        })
    );
}
