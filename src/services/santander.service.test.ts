import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod/v4';
import { SantanderBusService } from './santander.service.js';
import { BusEstimation, BusLine, BusLineStop, BusStop } from '../types/bus.js';

const TIMESTAMP = '2026-08-22T12:00:00.000Z';

function busStop(overrides: Partial<BusStop> = {}): BusStop {
    return {
        'wgs84_pos:long': '-3.8000',
        'ayto:coordY_ETRS89': '4812000.0',
        'ayto:numero': '1',
        'gn:coordY': '43.4600',
        'gn:coordX': '-3.8000',
        'ayto:sentido': 'CENTRO',
        'vivo:address1': 'Calle de prueba',
        'ayto:coordX_ETRS89': '432000.0',
        'dc:modified': TIMESTAMP,
        'wgs84_pos:lat': '43.4600',
        'ayto:parada': 'Parada de prueba',
        'dc:identifier': '1',
        uri: 'https://datos.santander.es/recurso/parada/1',
        ...overrides
    };
}

function busLine(overrides: Partial<BusLine> = {}): BusLine {
    return {
        'ayto:numero': '1',
        'dc:name': 'Línea de prueba',
        'dc:modified': TIMESTAMP,
        'dc:identifier': '1',
        uri: 'https://datos.santander.es/recurso/linea/1',
        ...overrides
    };
}

function busLineStop(overrides: Partial<BusLineStop> = {}): BusLineStop {
    return {
        'wgs84_pos:long': '-3.8000',
        'gn:coordY': '43.4600',
        'gn:coordX': '-3.8000',
        'ayto:linea': '1',
        'dc:modified': TIMESTAMP,
        'wgs84_pos:lat': '43.4600',
        'ayto:parada': '15',
        'dc:identifier': '1',
        uri: 'https://datos.santander.es/recurso/linea-parada/1',
        ...overrides
    };
}

function busEstimation(overrides: Partial<BusEstimation> = {}): BusEstimation {
    return {
        'ayto:tiempo1': '120',
        'ayto:distancia2': '500',
        'ayto:destino1': 'Centro',
        'ayto:distancia1': '250',
        'ayto:tiempo2': '300',
        'ayto:paradaId': '15',
        'ayto:destino2': 'Estaciones',
        'ayto:fechActual': TIMESTAMP,
        'dc:modified': TIMESTAMP,
        'dc:identifier': '1',
        'ayto:etiqLinea': '24C2',
        uri: 'https://datos.santander.es/recurso/estimacion/1',
        ...overrides
    };
}

function page<T>(
    resources: T[],
    { items = resources.length, pages = 1, currentPage = 1 } = {}
) {
    return {
        summary: {
            items,
            items_per_page: 1000,
            pages,
            current_page: currentPage
        },
        resources
    };
}

function mockOpenData(
    context: test.TestContext,
    responseFor: (url: URL) => unknown
) {
    const requestedUrls: URL[] = [];
    context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : input);
        requestedUrls.push(url);
        return new Response(JSON.stringify(responseFor(url)), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    });
    return requestedUrls;
}

test('fetches page 2 and maps public line 24C2 to API line ID 242', async (context) => {
    const requestedUrls = mockOpenData(context, (url) => {
        const requestedPage = Number(url.searchParams.get('page'));

        if (url.pathname.endsWith('/lineas_bus.json')) {
            return page([
                busLine({
                    'ayto:numero': '24C2',
                    'dc:name': 'Complejo Ruth Beitia - Estaciones',
                    'dc:identifier': '242'
                })
            ]);
        }
        if (url.pathname.endsWith('/lineas_bus_paradas.json') && requestedPage === 1) {
            return page(
                [busLineStop({ 'ayto:linea': '1', 'dc:identifier': '1001' })],
                { items: 2, pages: 2, currentPage: 1 }
            );
        }
        if (url.pathname.endsWith('/lineas_bus_paradas.json') && requestedPage === 2) {
            return page(
                [busLineStop({ 'ayto:linea': '242', 'dc:identifier': '1002' })],
                { items: 2, pages: 2, currentPage: 2 }
            );
        }
        throw new Error(`Unexpected Open Data request: ${url}`);
    });

    const result = await SantanderBusService.getBusLineStops('24C2');

    assert.equal(result.line, '24C2');
    assert.equal(result.line_id, '242');
    assert.equal(result.total_found, 1);
    assert.equal(result.stops[0]['ayto:linea'], '242');
    assert.ok(requestedUrls.some((url) =>
        url.pathname.endsWith('/lineas_bus_paradas.json') && url.searchParams.get('page') === '2'
    ));
    assert.ok(requestedUrls.every((url) => url.protocol === 'https:'));
});

test('prioritizes public stop number 15 over a colliding API resource ID', async (context) => {
    const resourceIdMatch = busStop({
        'ayto:numero': '48',
        'ayto:parada': 'Coincidencia por recurso',
        'dc:identifier': '15'
    });
    const publicNumberMatch = busStop({
        'ayto:numero': '15',
        'ayto:parada': 'Coincidencia por número público',
        'dc:identifier': '159'
    });
    mockOpenData(context, (url) => {
        if (url.pathname.endsWith('/paradas_bus.json')) {
            return page([resourceIdMatch, publicNumberMatch]);
        }
        throw new Error(`Unexpected Open Data request: ${url}`);
    });

    const searchResult = await SantanderBusService.getBusStops(2, '15');
    const lookupResult = await SantanderBusService.getBusStop('15');

    assert.deepEqual(
        searchResult.stops.map((stop) => stop['ayto:numero']),
        ['15', '48']
    );
    assert.equal(lookupResult['dc:identifier'], '159');
});

test('normalizes an empty second bus and preserves zero and negative first-bus values', async (context) => {
    mockOpenData(context, (url) => {
        if (url.pathname.endsWith('/control_flotas_estimaciones.json')) {
            return page([
                busEstimation({
                    'ayto:tiempo1': '0',
                    'ayto:distancia1': '-1',
                    'ayto:destino2': '',
                    'ayto:tiempo2': '',
                    'ayto:distancia2': ''
                })
            ]);
        }
        throw new Error(`Unexpected Open Data request: ${url}`);
    });

    const result = await SantanderBusService.getBusEstimations();

    assert.deepEqual(result.estimations[0].first_bus, {
        destination: 'Centro',
        arrival_seconds: 0,
        distance_meters: -1
    });
    assert.deepEqual(result.estimations[0].second_bus, {
        destination: null,
        arrival_seconds: null,
        distance_meters: null
    });
});

test('rejects Open Data payloads that do not satisfy their Zod schemas', async (context) => {
    mockOpenData(context, (url) => {
        if (url.pathname.endsWith('/lineas_bus.json')) {
            return page([busLine({ 'dc:name': '' })]);
        }
        if (url.pathname.endsWith('/control_flotas_estimaciones.json')) {
            return page([busEstimation({
                'ayto:destino2': '',
                'ayto:tiempo2': '300',
                'ayto:distancia2': ''
            })]);
        }
        throw new Error(`Unexpected Open Data request: ${url}`);
    });

    await assert.rejects(
        SantanderBusService.getBusLines(),
        /Open Data API returned invalid data for lineas_bus/
    );
    await assert.rejects(
        SantanderBusService.getBusEstimations(),
        /Open Data API returned invalid data for control_flotas_estimaciones/
    );
});

test('rejects invalid inputs and limits before contacting Open Data', async (context) => {
    const fetchMock = context.mock.method(globalThis, 'fetch', async () => {
        throw new Error('fetch should not be called');
    });
    const invalidCalls: Array<[string, () => Promise<unknown>]> = [
        ['zero bus-stop limit', () => SantanderBusService.getBusStops(0)],
        ['bus-stop limit above 100', () => SantanderBusService.getBusStops(101)],
        ['fractional bus-stop limit', () => SantanderBusService.getBusStops(1.5)],
        ['blank stop search', () => SantanderBusService.getBusStops(10, '   ')],
        ['blank line search', () => SantanderBusService.getBusLines('   ')],
        ['prefixed stop number', () => SantanderBusService.getBusStop('ayto:15')],
        ['blank line number', () => SantanderBusService.getBusLineStops('   ')],
        ['invalid estimation stop', () => SantanderBusService.getBusEstimations('stop-15')],
        ['blank estimation line', () => SantanderBusService.getBusEstimations(undefined, '   ')],
        ['zero estimation limit', () => SantanderBusService.getBusEstimations(undefined, undefined, 0)],
        ['estimation limit above 100', () => SantanderBusService.getBusEstimations(undefined, undefined, 101)],
        ['fractional estimation limit', () => SantanderBusService.getBusEstimations(undefined, undefined, 1.5)]
    ];

    for (const [description, call] of invalidCalls) {
        await assert.rejects(call, ZodError, description);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
