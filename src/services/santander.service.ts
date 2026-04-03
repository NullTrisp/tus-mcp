import { 
    BusLinesResponse, 
    BusLineStopsResponse, 
    BusStopsResponse, 
    BusEstimationsResponse,
    BusStop,
    BusLine,
    BusLineStop
} from '../types/bus.js';

export class SantanderBusService {
    private static readonly BASE_URL = 'http://datos.santander.es/api/rest/datasets';
    private static readonly HTTPS_BASE_URL = 'https://datos.santander.es/api/rest/datasets';

    static async getBusStops(limit: number = 10, search?: string) {
        const response = await fetch(`${this.HTTPS_BASE_URL}/paradas_bus.json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch bus stops: ${response.statusText}`);
        }
        const data = (await response.json()) as BusStopsResponse;
        let stops = data.resources || [];

        if (search) {
            const searchLower = search.toLowerCase();
            stops = stops.filter((stop) =>
                (stop['ayto:parada'] && String(stop['ayto:parada']).toLowerCase().includes(searchLower)) ||
                (stop['vivo:address1'] && String(stop['vivo:address1']).toLowerCase().includes(searchLower)) ||
                (stop['dc:identifier'] && String(stop['dc:identifier']).includes(searchLower))
            );
        }

        const limitedStops = stops.slice(0, Math.min(limit, 100));
        return {
            total_found: stops.length,
            returned: limitedStops.length,
            stops: limitedStops
        };
    }

    static async getBusLines(search?: string) {
        const response = await fetch(`${this.BASE_URL}/lineas_bus.json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch bus lines: ${response.statusText}`);
        }
        const data = (await response.json()) as BusLinesResponse;
        let lines = data.resources || [];

        if (search) {
            const searchLower = search.toLowerCase();
            lines = lines.filter((line) =>
                (line['ayto:numero'] && String(line['ayto:numero']).toLowerCase().includes(searchLower)) ||
                (line['dc:name'] && String(line['dc:name']).toLowerCase().includes(searchLower))
            );
        }

        return {
            total_found: lines.length,
            lines: lines
        };
    }

    static async getBusLineStops(lineId: string) {
        const response = await fetch(`${this.BASE_URL}/lineas_bus_paradas.json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch bus line stops: ${response.statusText}`);
        }
        const data = (await response.json()) as BusLineStopsResponse;
        let stops = data.resources || [];

        if (lineId) {
            stops = stops.filter((stop) =>
                (stop['ayto:linea'] && String(stop['ayto:linea']) === lineId)
            );
        }

        return {
            line: lineId,
            total_found: stops.length,
            stops: stops
        };
    }

    static async getBusEstimations(stopId?: string, lineId?: string, limit: number = 20) {
        // We fetch a larger number of items to ensure we find the stop/line requested
        const response = await fetch(`${this.BASE_URL}/control_flotas_estimaciones.json?items=1000`);
        if (!response.ok) {
            throw new Error(`Failed to fetch bus estimations: ${response.statusText}`);
        }
        const data = (await response.json()) as BusEstimationsResponse;
        let estimations = data.resources || [];

        if (stopId) {
            estimations = estimations.filter((estim) =>
                (estim['ayto:paradaId'] && String(estim['ayto:paradaId']) === stopId)
            );
        }

        if (lineId) {
            const lineLower = String(lineId).toLowerCase();
            estimations = estimations.filter((estim) =>
                (estim['ayto:etiqLinea'] && String(estim['ayto:etiqLinea']).toLowerCase() === lineLower)
            );
        }

        // Format the output for better readability
        const formattedEstimations = estimations.map(estim => {
            const t1Seconds = parseInt(estim['ayto:tiempo1'] || '0');
            const t2Seconds = parseInt(estim['ayto:tiempo2'] || '0');

            return {
                line: estim['ayto:etiqLinea'],
                stopId: estim['ayto:paradaId'],
                destinations: {
                    first: estim['ayto:destino1'],
                    second: estim['ayto:destino2']
                },
                arrivals: {
                    first_bus: t1Seconds > 0 ? `${Math.round(t1Seconds / 60)} min (${t1Seconds}s)` : 'Arriving/No data',
                    second_bus: t2Seconds > 0 ? `${Math.round(t2Seconds / 60)} min (${t2Seconds}s)` : 'No data'
                },
                distances: {
                    first_bus: estim['ayto:distancia1'] ? `${estim['ayto:distancia1']}m` : undefined,
                    second_bus: estim['ayto:distancia2'] ? `${estim['ayto:distancia2']}m` : undefined
                },
                timestamp: estim['ayto:fechActual']
            };
        });

        const finalResults = formattedEstimations.slice(0, limit);

        return {
            filters: { stopId, lineId },
            total_found: estimations.length,
            returned: finalResults.length,
            estimations: finalResults
        };
    }
}
