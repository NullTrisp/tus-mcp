import * as z from 'zod/v4';
import {
    apiResponseSchema,
    busEstimationSchema,
    busEstimationsInputSchema,
    busEstimationsResultSchema,
    busLineSchema,
    busLinesInputSchema,
    busLinesResultSchema,
    busLineStopSchema,
    busLineStopsInputSchema,
    busLineStopsResultSchema,
    busStopSchema,
    busStopLookupInputSchema,
    busStopsInputSchema,
    busStopsResultSchema,
    BusLine,
    BusStop
} from '../types/bus.js';

const DATASET_PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 15_000;

type DatasetName =
    | 'paradas_bus'
    | 'lineas_bus'
    | 'lineas_bus_paradas'
    | 'control_flotas_estimaciones';

export class SantanderBusService {
    private static readonly BASE_URL = 'https://datos.santander.es/api/rest/datasets';

    private static datasetUrl(dataset: DatasetName) {
        return `${this.BASE_URL}/${dataset}.json`;
    }

    private static async fetchPage<T extends { 'dc:identifier': string }>(
        dataset: DatasetName,
        schema: z.ZodType<T>,
        page: number
    ) {
        const url = new URL(this.datasetUrl(dataset));
        url.searchParams.set('items', String(DATASET_PAGE_SIZE));
        url.searchParams.set('page', String(page));

        let response: Response;
        try {
            response = await fetch(url, {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });
        } catch (error) {
            throw new Error(`Santander Open Data API request failed for ${dataset}.`, { cause: error });
        }

        if (!response.ok) {
            throw new Error(
                `Santander Open Data API request failed for ${dataset} (${response.status} ${response.statusText}).`
            );
        }
        const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
        if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
            throw new Error(`Santander Open Data API returned a non-JSON content type for ${dataset}.`);
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch (error) {
            throw new Error(`Santander Open Data API returned invalid JSON for ${dataset}.`, { cause: error });
        }

        const parsed = apiResponseSchema(schema).safeParse(payload);
        if (!parsed.success) {
            throw new Error(
                `Santander Open Data API returned invalid data for ${dataset}: ${z.prettifyError(parsed.error)}`
            );
        }
        if (parsed.data.summary.current_page !== page) {
            throw new Error(`Santander Open Data API returned page ${parsed.data.summary.current_page}; expected ${page}.`);
        }

        return parsed.data;
    }

    private static async fetchDataset<T extends { 'dc:identifier': string }>(
        dataset: DatasetName,
        schema: z.ZodType<T>
    ): Promise<T[]> {
        const firstPage = await this.fetchPage(dataset, schema, 1);
        const remainingPages = [];
        for (let page = 2; page <= firstPage.summary.pages; page += 1) {
            remainingPages.push(await this.fetchPage(dataset, schema, page));
        }

        const pages = [firstPage, ...remainingPages];
        if (pages.some((page) =>
            page.summary.items !== firstPage.summary.items || page.summary.pages !== firstPage.summary.pages
        )) {
            throw new Error(`Santander Open Data API changed ${dataset} while it was being fetched.`);
        }

        const resources = pages.flatMap((page) => page.resources);
        const uniqueResources = new Map(resources.map((resource) => [resource['dc:identifier'], resource]));
        if (uniqueResources.size !== firstPage.summary.items) {
            throw new Error(
                `Santander Open Data API returned ${uniqueResources.size} unique ${dataset} records; expected ${firstPage.summary.items}.`
            );
        }

        return [...uniqueResources.values()];
    }

    private static findLine(lines: BusLine[], lineId: string): BusLine {
        const normalizedId = lineId.toLowerCase();
        const line = lines.find((candidate) => candidate['ayto:numero'].toLowerCase() === normalizedId);
        if (!line) {
            throw new Error(`Bus line "${lineId}" does not exist in the Santander Open Data API.`);
        }
        return line;
    }

    private static findStop(stops: BusStop[], stopId: string): BusStop {
        const stop = stops.find((candidate) => candidate['ayto:numero'] === stopId);
        if (!stop) {
            throw new Error(`Bus stop "${stopId}" does not exist in the Santander Open Data API.`);
        }
        return stop;
    }

    static async getBusStops(limit: number = 10, search?: string) {
        const input = busStopsInputSchema.parse({ limit, search });
        let stops = await this.fetchDataset('paradas_bus', busStopSchema);

        if (input.search) {
            const normalizedSearch = input.search.toLowerCase();
            const matchScore = (stop: BusStop) => {
                if (stop['ayto:numero'].toLowerCase() === normalizedSearch) return 2;
                if (stop['dc:identifier'].toLowerCase() === normalizedSearch) return 1;
                return 0;
            };
            stops = stops
                .filter((stop) =>
                    stop['ayto:parada'].toLowerCase().includes(normalizedSearch) ||
                    stop['vivo:address1'].toLowerCase().includes(normalizedSearch) ||
                    stop['ayto:numero'].toLowerCase().includes(normalizedSearch) ||
                    stop['dc:identifier'].toLowerCase().includes(normalizedSearch)
                )
                .sort((first, second) => matchScore(second) - matchScore(first));
        }

        const limitedStops = stops.slice(0, input.limit);
        return busStopsResultSchema.parse({
            source_urls: [this.datasetUrl('paradas_bus')],
            fetched_at: new Date().toISOString(),
            total_found: stops.length,
            returned: limitedStops.length,
            stops: limitedStops
        });
    }

    static async getBusLines(search?: string) {
        const input = busLinesInputSchema.parse({ search });
        let lines = await this.fetchDataset('lineas_bus', busLineSchema);

        if (input.search) {
            const normalizedSearch = input.search.toLowerCase();
            lines = lines.filter((line) =>
                line['ayto:numero'].toLowerCase().includes(normalizedSearch) ||
                line['dc:name'].toLowerCase().includes(normalizedSearch) ||
                line['dc:identifier'].toLowerCase().includes(normalizedSearch)
            );
        }

        return busLinesResultSchema.parse({
            source_urls: [this.datasetUrl('lineas_bus')],
            fetched_at: new Date().toISOString(),
            total_found: lines.length,
            lines
        });
    }

    static async getBusStop(stopId: string) {
        const input = busStopLookupInputSchema.parse({ stopId });
        const stops = await this.fetchDataset('paradas_bus', busStopSchema);
        return this.findStop(stops, input.stopId);
    }

    static async getBusLineStops(lineId: string) {
        const input = busLineStopsInputSchema.parse({ lineId });
        const [lines, lineStops] = await Promise.all([
            this.fetchDataset('lineas_bus', busLineSchema),
            this.fetchDataset('lineas_bus_paradas', busLineStopSchema)
        ]);
        const line = this.findLine(lines, input.lineId);
        const stops = lineStops.filter((stop) => stop['ayto:linea'] === line['dc:identifier']);

        return busLineStopsResultSchema.parse({
            source_urls: [this.datasetUrl('lineas_bus'), this.datasetUrl('lineas_bus_paradas')],
            fetched_at: new Date().toISOString(),
            line: line['ayto:numero'],
            line_id: line['dc:identifier'],
            line_name: line['dc:name'],
            total_found: stops.length,
            stops
        });
    }

    static async getBusEstimations(stopId?: string, lineId?: string, limit: number = 20) {
        const input = busEstimationsInputSchema.parse({ stopId, lineId, limit });
        const [allEstimations, stops, lines] = await Promise.all([
            this.fetchDataset('control_flotas_estimaciones', busEstimationSchema),
            input.stopId ? this.fetchDataset('paradas_bus', busStopSchema) : Promise.resolve(undefined),
            input.lineId ? this.fetchDataset('lineas_bus', busLineSchema) : Promise.resolve(undefined)
        ]);
        const warnings: string[] = [];
        const stop = input.stopId
            ? stops!.find((candidate) => candidate['ayto:numero'] === input.stopId)
            : undefined;
        const line = input.lineId
            ? lines!.find((candidate) => candidate['ayto:numero'].toLowerCase() === input.lineId!.toLowerCase())
            : undefined;
        const stopNumber = stop?.['ayto:numero'] || input.stopId;
        const lineNumber = line?.['ayto:numero'] || input.lineId;

        if (input.stopId && !stop) {
            if (!allEstimations.some((estimation) => estimation['ayto:paradaId'] === input.stopId)) {
                throw new Error(`Bus stop "${input.stopId}" does not exist in the Santander Open Data API.`);
            }
            warnings.push(`Stop ${input.stopId} exists in live estimates but is missing from paradas_bus.`);
        }
        if (input.lineId && !line) {
            if (!allEstimations.some((estimation) =>
                estimation['ayto:etiqLinea'].toLowerCase() === input.lineId!.toLowerCase()
            )) {
                throw new Error(`Bus line "${input.lineId}" does not exist in the Santander Open Data API.`);
            }
            warnings.push(`Line ${input.lineId} exists in live estimates but is missing from lineas_bus.`);
        }
        let estimations = allEstimations;

        if (stopNumber) {
            estimations = estimations.filter((estimation) =>
                estimation['ayto:paradaId'] === stopNumber
            );
        }
        if (lineNumber) {
            estimations = estimations.filter((estimation) =>
                estimation['ayto:etiqLinea'].toLowerCase() === lineNumber.toLowerCase()
            );
        }

        const formattedEstimations = estimations.slice(0, input.limit).map((estimation) => ({
            line: estimation['ayto:etiqLinea'],
            stopId: estimation['ayto:paradaId'],
            first_bus: {
                destination: estimation['ayto:destino1'],
                arrival_seconds: Number(estimation['ayto:tiempo1']),
                distance_meters: Number(estimation['ayto:distancia1'])
            },
            second_bus: {
                destination: estimation['ayto:destino2'] || null,
                arrival_seconds: estimation['ayto:tiempo2'] ? Number(estimation['ayto:tiempo2']) : null,
                distance_meters: estimation['ayto:distancia2'] ? Number(estimation['ayto:distancia2']) : null
            },
            observed_at: estimation['ayto:fechActual'],
            source_modified_at: estimation['dc:modified']
        }));

        return busEstimationsResultSchema.parse({
            source_urls: [
                this.datasetUrl('control_flotas_estimaciones'),
                ...(input.stopId ? [this.datasetUrl('paradas_bus')] : []),
                ...(input.lineId ? [this.datasetUrl('lineas_bus')] : [])
            ],
            fetched_at: new Date().toISOString(),
            filters: {
                stopId: stopNumber,
                lineId: lineNumber
            },
            total_found: estimations.length,
            returned: formattedEstimations.length,
            warnings,
            estimations: formattedEstimations
        });
    }
}
