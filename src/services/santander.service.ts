import * as z from 'zod/v4';
import {
    apiResponseSchema,
    busEstimationSchema,
    busEstimationsInputSchema,
    busEstimationsResultSchema,
    busLineSchema,
    busLineSequenceSchema,
    busLinesInputSchema,
    busLinesResultSchema,
    busLineStopSchema,
    busLineStopsInputSchema,
    busLineStopsResultSchema,
    busStopSchema,
    busStopLookupInputSchema,
    busStopsInputSchema,
    busStopsResultSchema,
    busPositionSchema,
    busVehicleSchema,
    recentBusPositionsInputSchema,
    recentBusPositionsResultSchema,
    tusRechargePointSchema,
    tusRechargePointsInputSchema,
    tusRechargePointsResultSchema,
    tuebiciStationInformationResponseSchema,
    tuebiciStationsInputSchema,
    tuebiciStationsResultSchema,
    tuebiciStationStatusResponseSchema,
    nearbyInputSchema,
    nearbyTuebiciInputSchema,
    nearbyBusStopsResultSchema,
    nearbyTusRechargePointsResultSchema,
    nearbyTuebiciStationsResultSchema,
    userLocationSchema,
    BusLine,
    BusPosition,
    BusStop,
    BusVehicle
} from '../types/bus.js';

const DATASET_PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const EARTH_RADIUS_METERS = 6_371_000;

function rankNearby<T extends object>(
    items: T[],
    coordinates: (item: T) => { latitude: number; longitude: number },
    origin: { latitude: number; longitude: number },
    radiusMeters: number,
    limit: number
) {
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const ranked = items.map((item) => {
        const destination = coordinates(item);
        const latitudeDelta = radians(destination.latitude - origin.latitude);
        const longitudeDelta = radians(destination.longitude - origin.longitude);
        const firstLatitude = radians(origin.latitude);
        const secondLatitude = radians(destination.latitude);
        const haversine = Math.sin(latitudeDelta / 2) ** 2
            + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
        const distanceMeters = Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, haversine))));
        return { ...item, distance_meters: distanceMeters };
    }).filter((item) => item.distance_meters <= radiusMeters)
        .sort((first, second) => first.distance_meters - second.distance_meters);

    return { total: ranked.length, items: ranked.slice(0, limit) };
}

type DatasetName =
    | 'paradas_bus'
    | 'lineas_bus'
    | 'lineas_bus_paradas'
    | 'lineas_bus_secuencia'
    | 'control_flotas_estimaciones'
    | 'control_flotas_posiciones'
    | 'control_flotas_vehiculos'
    | 'tus_puntos_recarga';

export class SantanderBusService {
    private static readonly BASE_URL = 'https://datos.santander.es/api/rest/datasets';
    private static readonly TUEBICI_STATION_INFORMATION_URL = 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ek/es/station_information.json';
    private static readonly TUEBICI_STATION_STATUS_URL = 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ek/es/station_status.json';

    private static datasetUrl(dataset: DatasetName) {
        return `${this.BASE_URL}/${dataset}.json`;
    }

    private static async fetchGbfs<T>(url: string, schema: z.ZodType<T>): Promise<T> {
        let response: Response;
        try {
            response = await fetch(url, {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });
        } catch (error) {
            throw new Error('TUeBICI GBFS request failed.', { cause: error });
        }
        if (!response.ok) {
            throw new Error(`TUeBICI GBFS request failed (${response.status} ${response.statusText}).`);
        }
        const parsed = schema.safeParse(await response.json());
        if (!parsed.success) {
            throw new Error(`TUeBICI GBFS returned invalid data: ${z.prettifyError(parsed.error)}`);
        }
        return parsed.data;
    }

    private static async fetchPage<T extends { uri: string }>(
        dataset: DatasetName,
        schema: z.ZodType<T>,
        page: number,
        query?: string
    ) {
        const url = new URL(this.datasetUrl(dataset));
        url.searchParams.set('items', String(DATASET_PAGE_SIZE));
        url.searchParams.set('page', String(page));
        if (query) url.searchParams.set('query', query);

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

    private static async fetchDataset<T extends { uri: string }>(
        dataset: DatasetName,
        schema: z.ZodType<T>,
        query?: string
    ): Promise<T[]> {
        const firstPage = await this.fetchPage(dataset, schema, 1, query);
        const remainingPages = [];
        for (let page = 2; page <= firstPage.summary.pages; page += 1) {
            remainingPages.push(await this.fetchPage(dataset, schema, page, query));
        }

        const pages = [firstPage, ...remainingPages];
        if (pages.some((page) =>
            page.summary.items !== firstPage.summary.items || page.summary.pages !== firstPage.summary.pages
        )) {
            throw new Error(`Santander Open Data API changed ${dataset} while it was being fetched.`);
        }

        const resources = pages.flatMap((page) => page.resources);
        const uniqueResources = new Map(resources.map((resource) => [
            'dc:identifier' in resource && typeof resource['dc:identifier'] === 'string'
                ? resource['dc:identifier']
                : resource.uri,
            resource
        ]));
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

    static async getNearbyBusStops(
        latitude: number,
        longitude: number,
        limit: number = 5,
        radiusMeters: number = 1000
    ) {
        const origin = userLocationSchema.parse({ latitude, longitude });
        const input = nearbyInputSchema.parse({ limit, radiusMeters });
        const stops = await this.fetchDataset('paradas_bus', busStopSchema);
        const nearby = rankNearby(
            stops,
            (stop) => ({
                latitude: Number(stop['wgs84_pos:lat']),
                longitude: Number(stop['wgs84_pos:long'])
            }),
            origin,
            input.radiusMeters,
            input.limit
        );

        return nearbyBusStopsResultSchema.parse({
            source_urls: [this.datasetUrl('paradas_bus')],
            fetched_at: new Date().toISOString(),
            radius_meters: input.radiusMeters,
            total_found: nearby.total,
            returned: nearby.items.length,
            stops: nearby.items
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
        const lines = await this.fetchDataset('lineas_bus', busLineSchema);
        const line = this.findLine(lines, input.lineId);
        const sequenceQuery = `dc\\:EtiquetaLinea:${line['ayto:numero']}`;
        const [lineStops, sequences, allStops] = await Promise.all([
            this.fetchDataset('lineas_bus_paradas', busLineStopSchema),
            this.fetchDataset('lineas_bus_secuencia', busLineSequenceSchema, sequenceQuery),
            this.fetchDataset('paradas_bus', busStopSchema)
        ]);
        const stops = lineStops.filter((stop) => stop['ayto:linea'] === line['dc:identifier']);
        const lineStopByNumber = new Map(stops.map((stop) => [stop['ayto:parada'], stop]));
        const stopByNumber = new Map(allStops.map((stop) => [stop['ayto:numero'], stop]));
        const routeGroups = new Map<string, typeof sequences>();
        for (const sequence of sequences) {
            const key = `${sequence['ayto:Ruta']}:${sequence['ayto:SentidoRuta']}`;
            const group = routeGroups.get(key) ?? [];
            group.push(sequence);
            routeGroups.set(key, group);
        }
        const warnings: string[] = [];
        const routes = [...routeGroups.values()].map((route) => {
            const ordered = route.sort((first, second) =>
                Number(first['ayto:PuntoKM']) - Number(second['ayto:PuntoKM'])
            );
            const routeStops = ordered.flatMap((sequence, index) => {
                const relationship = lineStopByNumber.get(sequence['ayto:NParada']);
                const stop = stopByNumber.get(sequence['ayto:NParada']);
                const latitude = relationship?.['wgs84_pos:lat'] ?? stop?.['wgs84_pos:lat'];
                const longitude = relationship?.['wgs84_pos:long'] ?? stop?.['wgs84_pos:long'];
                if (!latitude || !longitude) {
                    warnings.push(`Stop ${sequence['ayto:NParada']} has sequence data but no WGS84 coordinates.`);
                    return [];
                }
                return [{
                    stopId: sequence['ayto:NParada'],
                    name: sequence['ayto:NombreParada'],
                    ...(stop && { address: stop['vivo:address1'] }),
                    sequence: index + 1,
                    distance_meters: Number(sequence['ayto:PuntoKM']),
                    latitude: Number(latitude),
                    longitude: Number(longitude)
                }];
            });
            return {
                route_id: ordered[0]['ayto:Ruta'],
                direction: ordered[0]['ayto:SentidoRuta'],
                name: ordered[0]['ayto:NombreSublinea'],
                total_found: routeStops.length,
                stops: routeStops
            };
        }).sort((first, second) =>
            first.direction.localeCompare(second.direction) || Number(first.route_id) - Number(second.route_id)
        );

        return busLineStopsResultSchema.parse({
            source_urls: [
                this.datasetUrl('lineas_bus'),
                this.datasetUrl('lineas_bus_paradas'),
                this.datasetUrl('lineas_bus_secuencia'),
                this.datasetUrl('paradas_bus')
            ],
            fetched_at: new Date().toISOString(),
            line: line['ayto:numero'],
            line_id: line['dc:identifier'],
            line_name: line['dc:name'],
            total_found: stops.length,
            stops,
            routes,
            warnings
        });
    }

    static async getRecentBusPositions(lineId?: string, maxAgeMinutes: number = 15) {
        const input = recentBusPositionsInputSchema.parse({ lineId, maxAgeMinutes });
        const lines = await this.fetchDataset('lineas_bus', busLineSchema);
        const selectedLine = input.lineId ? this.findLine(lines, input.lineId) : undefined;
        const now = new Date();
        const observedSince = new Date(now.getTime() - input.maxAgeMinutes * 60_000);
        const query = [
            `ayto\\:instante:{${observedSince.toISOString()} TO ${new Date(now.getTime() + 60_000).toISOString()}}`,
            ...(selectedLine ? [`ayto\\:linea:${selectedLine['dc:identifier']}`] : [])
        ].join(' AND ');
        const [observations, vehicles] = await Promise.all([
            this.fetchDataset('control_flotas_posiciones', busPositionSchema, query),
            this.fetchDataset('control_flotas_vehiculos', busVehicleSchema)
        ]);
        const latestByVehicle = new Map<string, BusPosition>();
        for (const observation of observations) {
            const current = latestByVehicle.get(observation['ayto:vehiculo']);
            if (!current || observation['ayto:instante'] > current['ayto:instante']) {
                latestByVehicle.set(observation['ayto:vehiculo'], observation);
            }
        }
        const lineById = new Map(lines.map((line) => [line['dc:identifier'], line]));
        const vehicleById = new Map(vehicles.map((vehicle) => [vehicle['dc:identifier'], vehicle]));
        const optionalNumber = (value: string) => value === '' ? null : Number(value);
        const vehicleDetails = (vehicle?: BusVehicle) => {
            if (!vehicle) return null;
            const seated = optionalNumber(vehicle['ayto:PlazasSentadas']);
            const standing = optionalNumber(vehicle['ayto:PlazasDePie']);
            return {
                fuel: vehicle['ayto:Combustible'] || null,
                length_meters: optionalNumber(vehicle['ayto:Longitud']),
                seated_capacity: seated,
                standing_capacity: standing,
                total_capacity: seated === null || standing === null ? null : seated + standing
            };
        };
        const positions = [...latestByVehicle.values()].map((observation) => {
            const line = lineById.get(observation['ayto:linea']);
            return {
                vehicleId: observation['ayto:vehiculo'],
                line: line?.['ayto:numero'] ?? null,
                line_id: observation['ayto:linea'],
                line_name: line?.['dc:name'] ?? null,
                latitude: Number(observation['wgs84_pos:lat']),
                longitude: Number(observation['wgs84_pos:long']),
                speed_kmh: optionalNumber(observation['ayto:velocidad']),
                state: observation['ayto:estado'],
                observed_at: observation['ayto:instante'],
                age_seconds: Math.max(0, Math.floor((now.getTime() - Date.parse(observation['ayto:instante'])) / 1000)),
                vehicle: vehicleDetails(vehicleById.get(observation['ayto:vehiculo']))
            };
        }).sort((first, second) =>
            (first.line ?? '').localeCompare(second.line ?? '') || first.vehicleId.localeCompare(second.vehicleId)
        );

        return recentBusPositionsResultSchema.parse({
            source_urls: [
                this.datasetUrl('control_flotas_posiciones'),
                this.datasetUrl('control_flotas_vehiculos'),
                this.datasetUrl('lineas_bus')
            ],
            fetched_at: now.toISOString(),
            filters: {
                ...(selectedLine && { lineId: selectedLine['ayto:numero'] }),
                maxAgeMinutes: input.maxAgeMinutes
            },
            observed_since: observedSince.toISOString(),
            total_observations: observations.length,
            returned: positions.length,
            positions
        });
    }

    static async getTusRechargePoints(limit: number = 20, search?: string) {
        const input = tusRechargePointsInputSchema.parse({ limit, search });
        let points = await this.fetchDataset('tus_puntos_recarga', tusRechargePointSchema);
        if (input.search) {
            const term = input.search.toLowerCase();
            points = points.filter((point) => [
                point['dc:title'],
                point['dc:tipo_expendedor'],
                point['dc:ubicacion_calle'],
                point['dc:ubicacion_codigo_postal'],
                point['dc:ubicacion_poblacion']
            ].some((value) => value.toLowerCase().includes(term)));
        }
        const limitedPoints = points.slice(0, input.limit).map((point) => ({
            name: point['dc:title'],
            vendor_type: point['dc:tipo_expendedor'],
            address: point['dc:ubicacion_calle'],
            postcode: point['dc:ubicacion_codigo_postal'],
            town: point['dc:ubicacion_poblacion'],
            province: point['dc:ubicacion_provincia'],
            latitude: Number(point['dc:ubicacion_latitud']),
            longitude: Number(point['dc:ubicacion_longitud']),
            source_modified_at: point['dc:modified']
        }));

        return tusRechargePointsResultSchema.parse({
            source_urls: [this.datasetUrl('tus_puntos_recarga')],
            fetched_at: new Date().toISOString(),
            total_found: points.length,
            returned: limitedPoints.length,
            points: limitedPoints
        });
    }

    static async getNearbyTusRechargePoints(
        latitude: number,
        longitude: number,
        limit: number = 5,
        radiusMeters: number = 1000
    ) {
        const origin = userLocationSchema.parse({ latitude, longitude });
        const input = nearbyInputSchema.parse({ limit, radiusMeters });
        const points = (await this.fetchDataset('tus_puntos_recarga', tusRechargePointSchema)).map((point) => ({
            name: point['dc:title'],
            vendor_type: point['dc:tipo_expendedor'],
            address: point['dc:ubicacion_calle'],
            postcode: point['dc:ubicacion_codigo_postal'],
            town: point['dc:ubicacion_poblacion'],
            province: point['dc:ubicacion_provincia'],
            latitude: Number(point['dc:ubicacion_latitud']),
            longitude: Number(point['dc:ubicacion_longitud']),
            source_modified_at: point['dc:modified']
        }));
        const nearby = rankNearby(
            points,
            (point) => ({ latitude: point.latitude, longitude: point.longitude }),
            origin,
            input.radiusMeters,
            input.limit
        );

        return nearbyTusRechargePointsResultSchema.parse({
            source_urls: [this.datasetUrl('tus_puntos_recarga')],
            fetched_at: new Date().toISOString(),
            radius_meters: input.radiusMeters,
            total_found: nearby.total,
            returned: nearby.items.length,
            points: nearby.items
        });
    }

    private static async getTuebiciFeed() {
        const [information, availability] = await Promise.all([
            this.fetchGbfs(this.TUEBICI_STATION_INFORMATION_URL, tuebiciStationInformationResponseSchema),
            this.fetchGbfs(this.TUEBICI_STATION_STATUS_URL, tuebiciStationStatusResponseSchema)
        ]);
        const statusById = new Map(availability.data.stations.map((status) => [status.station_id, status]));
        const warnings: string[] = [];
        const stations = information.data.stations.map((station) => {
            const status = statusById.get(station.station_id);
            if (!status) warnings.push(`Station ${station.station_id} has no current availability record.`);
            return {
                stationId: station.station_id,
                ...(station.short_name && { short_name: station.short_name }),
                name: station.name,
                latitude: station.lat,
                longitude: station.lon,
                capacity: station.capacity,
                bikes_available: status?.num_bikes_available ?? null,
                docks_available: status?.num_docks_available ?? null,
                is_installed: status?.is_installed ?? null,
                is_renting: status?.is_renting ?? null,
                is_returning: status?.is_returning ?? null,
                last_reported_at: status ? new Date(status.last_reported * 1000).toISOString() : null,
                ...(station.rental_uris?.web && { rental_url: station.rental_uris.web })
            };
        });

        return {
            source_urls: [this.TUEBICI_STATION_INFORMATION_URL, this.TUEBICI_STATION_STATUS_URL],
            fetched_at: new Date().toISOString(),
            feed_updated_at: new Date(Math.min(information.last_updated, availability.last_updated) * 1000).toISOString(),
            warnings,
            stations
        };
    }

    static async getTuebiciStations(limit: number = 20, search?: string, onlyAvailable: boolean = false) {
        const input = tuebiciStationsInputSchema.parse({ limit, search, onlyAvailable });
        const feed = await this.getTuebiciFeed();
        let stations = feed.stations;
        if (input.search) {
            const term = input.search.toLowerCase();
            stations = stations.filter((station) =>
                station.name.toLowerCase().includes(term) || station.short_name?.toLowerCase().includes(term)
            );
        }
        if (input.onlyAvailable) {
            stations = stations.filter((station) => station.is_renting && (station.bikes_available ?? 0) > 0);
        }
        stations.sort((first, second) =>
            (second.bikes_available ?? -1) - (first.bikes_available ?? -1) || first.name.localeCompare(second.name)
        );
        const limitedStations = stations.slice(0, input.limit);

        return tuebiciStationsResultSchema.parse({
            source_urls: feed.source_urls,
            fetched_at: feed.fetched_at,
            feed_updated_at: feed.feed_updated_at,
            filters: {
                ...(input.search && { search: input.search }),
                onlyAvailable: input.onlyAvailable
            },
            total_found: stations.length,
            returned: limitedStations.length,
            warnings: feed.warnings,
            stations: limitedStations
        });
    }

    static async getNearbyTuebiciStations(
        latitude: number,
        longitude: number,
        limit: number = 5,
        radiusMeters: number = 1000,
        onlyAvailable: boolean = false
    ) {
        const origin = userLocationSchema.parse({ latitude, longitude });
        const input = nearbyTuebiciInputSchema.parse({ limit, radiusMeters, onlyAvailable });
        const feed = await this.getTuebiciFeed();
        const stations = input.onlyAvailable
            ? feed.stations.filter((station) => station.is_renting && (station.bikes_available ?? 0) > 0)
            : feed.stations;
        const nearby = rankNearby(
            stations,
            (station) => ({ latitude: station.latitude, longitude: station.longitude }),
            origin,
            input.radiusMeters,
            input.limit
        );

        return nearbyTuebiciStationsResultSchema.parse({
            source_urls: feed.source_urls,
            fetched_at: feed.fetched_at,
            feed_updated_at: feed.feed_updated_at,
            radius_meters: input.radiusMeters,
            only_available: input.onlyAvailable,
            total_found: nearby.total,
            returned: nearby.items.length,
            warnings: feed.warnings,
            stations: nearby.items
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
