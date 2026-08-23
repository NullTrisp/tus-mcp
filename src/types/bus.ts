import * as z from 'zod/v4';

const nonEmptyStringSchema = z.string().min(1);
const numericStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/, 'Expected a numeric string');
const integerStringSchema = z.string().regex(/^-?\d+$/, 'Expected an integer string');
const unsignedIntegerStringSchema = z.string().regex(/^\d+$/, 'Expected an unsigned integer string');
const optionalIntegerStringSchema = z.string().regex(/^(?:-?\d+)?$/, 'Expected an integer string or empty value');
const coordinateSchema = (minimum: number, maximum: number) => numericStringSchema.refine(
    (value) => Number(value) >= minimum && Number(value) <= maximum,
    `Expected a coordinate between ${minimum} and ${maximum}`
);
const stopNumberSchema = z.string().trim().regex(/^\d+$/, 'Expected a public stop number').max(10);
const lineNumberSchema = z.string().trim().min(1).max(50);
const webUrlSchema = z.url().refine(
    (value) => ['http:', 'https:'].includes(new URL(value).protocol),
    'Expected an HTTP(S) URL'
);
const httpsUrlSchema = z.url().refine((value) => new URL(value).protocol === 'https:', 'Expected an HTTPS URL');

export const busStopSchema = z.object({
    'wgs84_pos:long': coordinateSchema(-180, 180),
    'ayto:coordY_ETRS89': numericStringSchema,
    'ayto:numero': unsignedIntegerStringSchema,
    'gn:coordY': numericStringSchema,
    'gn:coordX': numericStringSchema,
    'ayto:sentido': nonEmptyStringSchema,
    'vivo:address1': nonEmptyStringSchema,
    'ayto:coordX_ETRS89': numericStringSchema,
    'dc:modified': z.iso.datetime(),
    'wgs84_pos:lat': coordinateSchema(-90, 90),
    'ayto:parada': nonEmptyStringSchema,
    'dc:identifier': unsignedIntegerStringSchema,
    uri: webUrlSchema
});

export const busLineSchema = z.object({
    'ayto:numero': nonEmptyStringSchema,
    'dc:name': nonEmptyStringSchema,
    'dc:modified': z.iso.datetime(),
    'dc:identifier': unsignedIntegerStringSchema,
    uri: webUrlSchema
});

export const busLineStopSchema = z.object({
    'wgs84_pos:long': coordinateSchema(-180, 180),
    'gn:coordY': numericStringSchema,
    'gn:coordX': numericStringSchema,
    'ayto:linea': unsignedIntegerStringSchema,
    'dc:modified': z.iso.datetime(),
    'wgs84_pos:lat': coordinateSchema(-90, 90),
    'ayto:parada': unsignedIntegerStringSchema,
    'dc:identifier': unsignedIntegerStringSchema,
    uri: webUrlSchema
});

export const busLineSequenceSchema = z.object({
    'ayto:Ruta': unsignedIntegerStringSchema,
    'ayto:PuntoKM': numericStringSchema,
    'ayto:NParada': unsignedIntegerStringSchema,
    'dc:EtiquetaLinea': nonEmptyStringSchema,
    'dc:modified': z.iso.datetime(),
    'ayto:Linea': unsignedIntegerStringSchema,
    'ayto:SentidoRuta': nonEmptyStringSchema,
    'dc:identifier': nonEmptyStringSchema,
    'ayto:NombreSublinea': nonEmptyStringSchema,
    'ayto:NombreParada': nonEmptyStringSchema,
    'ayto:PosX': numericStringSchema,
    'ayto:PosY': numericStringSchema,
    uri: webUrlSchema
});

export const busPositionSchema = z.object({
    'wgs84_pos:long': coordinateSchema(-180, 180),
    'ayto:instante': z.iso.datetime(),
    'gn:coordY': numericStringSchema,
    'gn:coordX': numericStringSchema,
    'ayto:linea': unsignedIntegerStringSchema,
    'ayto:velocidad': optionalIntegerStringSchema,
    'dc:modified': z.iso.datetime(),
    'ayto:vehiculo': unsignedIntegerStringSchema,
    'wgs84_pos:lat': coordinateSchema(-90, 90),
    'ayto:estado': nonEmptyStringSchema,
    uri: webUrlSchema
});

export const busVehicleSchema = z.object({
    'ayto:PlazasDePie': optionalIntegerStringSchema,
    'ayto:Longitud': z.string(),
    'dc:identifier': unsignedIntegerStringSchema,
    'ayto:Combustible': z.string(),
    'ayto:PlazasSentadas': optionalIntegerStringSchema,
    'dc:modified': z.iso.datetime(),
    uri: webUrlSchema
});

export const tusRechargePointSchema = z.object({
    'dc:ubicacion_latitud': coordinateSchema(-90, 90),
    'dc:ubicacion_codigo_postal': z.string(),
    'dc:tipo_expendedor': z.string(),
    'dc:ubicacion_provincia': z.string(),
    'dc:title': nonEmptyStringSchema,
    'dc:modified': z.iso.datetime(),
    'dc:ubicacion_calle': z.string(),
    'dc:ubicacion_ciudad': z.string(),
    'dc:ubicacion_poblacion': z.string(),
    'dc:ubicacion_longitud': coordinateSchema(-180, 180),
    uri: webUrlSchema
});

export const busEstimationSchema = z.object({
    'ayto:tiempo1': integerStringSchema,
    'ayto:distancia2': optionalIntegerStringSchema,
    'ayto:destino1': nonEmptyStringSchema,
    'ayto:distancia1': integerStringSchema,
    'ayto:tiempo2': optionalIntegerStringSchema,
    'ayto:paradaId': unsignedIntegerStringSchema,
    'ayto:destino2': z.string(),
    'ayto:fechActual': z.iso.datetime(),
    'dc:modified': z.iso.datetime(),
    'dc:identifier': unsignedIntegerStringSchema,
    'ayto:etiqLinea': nonEmptyStringSchema,
    uri: webUrlSchema
}).refine((estimation) => {
    const secondBusFields = [
        estimation['ayto:destino2'],
        estimation['ayto:tiempo2'],
        estimation['ayto:distancia2']
    ];
    return secondBusFields.every(Boolean) || secondBusFields.every((value) => value === '');
}, {
    message: 'Second-bus destination, time, and distance must be all present or all empty'
});

export const apiResponseSchema = <T extends z.ZodType>(resourceSchema: T) => z.object({
    summary: z.object({
        items: z.number().int().nonnegative(),
        items_per_page: z.number().int().positive(),
        pages: z.number().int().nonnegative().max(100),
        current_page: z.number().int().positive()
    }),
    resources: z.array(resourceSchema)
});

export const busStopsInputSchema = z.object({
    limit: z.number().int().min(1).max(100)
        .describe('Maximum number of bus stops to return (1-100)')
        .default(10),
    search: z.string().trim().min(1).max(100)
        .describe('Name, address, public stop number, or API resource ID')
        .optional()
});

export const busLinesInputSchema = z.object({
    search: z.string().trim().min(1).max(100)
        .describe('Public line number, name, or API resource ID')
        .optional()
});

export const busLineStopsInputSchema = z.object({
    lineId: lineNumberSchema.describe('Public line number from ayto:numero, for example 24C1 or N2')
});

export const recentBusPositionsInputSchema = z.object({
    lineId: lineNumberSchema.describe('Optional public line number from ayto:numero').optional(),
    maxAgeMinutes: z.number().int().min(1).max(120)
        .describe('Only include positions observed within this many minutes (1-120)')
        .default(15)
});

export const tusRechargePointsInputSchema = z.object({
    search: z.string().trim().min(1).max(100)
        .describe('Optional point name, street, postcode, town, or vendor type')
        .optional(),
    limit: z.number().int().min(1).max(100)
        .describe('Maximum number of recharge points to return (1-100)')
        .default(20)
});

export const busEstimationsInputSchema = z.object({
    stopId: stopNumberSchema.describe('Public stop number from ayto:numero, for example 15').optional(),
    lineId: lineNumberSchema.describe('Public line number from ayto:numero, for example 1 or 24C1').optional(),
    limit: z.number().int().min(1).max(100)
        .describe('Maximum number of arrival estimates to return (1-100)')
        .default(20)
});

export const busStopLookupInputSchema = z.object({
    stopId: stopNumberSchema.describe('Public stop number from ayto:numero')
});

const sourceMetadataShape = {
    source_urls: z.array(httpsUrlSchema).min(1),
    fetched_at: z.iso.datetime()
};

export const busStopsResultSchema = z.object({
    ...sourceMetadataShape,
    total_found: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    stops: z.array(busStopSchema)
}).refine((result) => result.returned === result.stops.length && result.total_found >= result.returned, {
    message: 'Bus-stop counts do not match the returned resources'
});

export const busLinesResultSchema = z.object({
    ...sourceMetadataShape,
    total_found: z.number().int().nonnegative(),
    lines: z.array(busLineSchema)
}).refine((result) => result.total_found === result.lines.length, {
    message: 'Bus-line count does not match the returned resources'
});

export const busLineStopsResultSchema = z.object({
    ...sourceMetadataShape,
    line: nonEmptyStringSchema,
    line_id: unsignedIntegerStringSchema,
    line_name: nonEmptyStringSchema,
    total_found: z.number().int().nonnegative(),
    stops: z.array(busLineStopSchema),
    warnings: z.array(nonEmptyStringSchema),
    routes: z.array(z.object({
        route_id: unsignedIntegerStringSchema,
        direction: nonEmptyStringSchema,
        name: nonEmptyStringSchema,
        total_found: z.number().int().nonnegative(),
        stops: z.array(z.object({
            stopId: unsignedIntegerStringSchema,
            name: nonEmptyStringSchema,
            address: z.string().optional(),
            sequence: z.number().int().positive(),
            distance_meters: z.number().nonnegative(),
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180)
        }))
    }))
}).refine((result) => result.total_found === result.stops.length, {
    message: 'Line-stop count does not match the returned resources'
}).refine((result) => result.routes.every((route) => route.total_found === route.stops.length), {
    message: 'Route-stop counts do not match the returned resources'
});

const vehicleDetailsSchema = z.object({
    fuel: z.string().nullable(),
    length_meters: z.number().nullable(),
    seated_capacity: z.number().int().nonnegative().nullable(),
    standing_capacity: z.number().int().nonnegative().nullable(),
    total_capacity: z.number().int().nonnegative().nullable()
});

export const recentBusPositionsResultSchema = z.object({
    ...sourceMetadataShape,
    filters: z.object({
        lineId: nonEmptyStringSchema.optional(),
        maxAgeMinutes: z.number().int().min(1).max(120)
    }),
    observed_since: z.iso.datetime(),
    total_observations: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    positions: z.array(z.object({
        vehicleId: unsignedIntegerStringSchema,
        line: nonEmptyStringSchema.nullable(),
        line_id: unsignedIntegerStringSchema,
        line_name: nonEmptyStringSchema.nullable(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        speed_kmh: z.number().int().nullable(),
        state: nonEmptyStringSchema,
        observed_at: z.iso.datetime(),
        age_seconds: z.number().int().nonnegative(),
        vehicle: vehicleDetailsSchema.nullable()
    }))
}).refine((result) => result.returned === result.positions.length, {
    message: 'Bus-position count does not match the returned resources'
});

export const tusRechargePointsResultSchema = z.object({
    ...sourceMetadataShape,
    total_found: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    points: z.array(z.object({
        name: nonEmptyStringSchema,
        vendor_type: z.string(),
        address: z.string(),
        postcode: z.string(),
        town: z.string(),
        province: z.string(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        source_modified_at: z.iso.datetime()
    }))
}).refine((result) => result.returned === result.points.length && result.total_found >= result.returned, {
    message: 'Recharge-point counts do not match the returned resources'
});

const formattedEstimationSchema = z.object({
    line: nonEmptyStringSchema,
    stopId: unsignedIntegerStringSchema,
    first_bus: z.object({
        destination: nonEmptyStringSchema,
        arrival_seconds: z.number().int(),
        distance_meters: z.number().int()
    }),
    second_bus: z.object({
        destination: z.string().nullable(),
        arrival_seconds: z.number().int().nullable(),
        distance_meters: z.number().int().nullable()
    }),
    observed_at: z.iso.datetime(),
    source_modified_at: z.iso.datetime()
});

export const busEstimationsResultSchema = z.object({
    ...sourceMetadataShape,
    filters: z.object({
        stopId: unsignedIntegerStringSchema.optional(),
        lineId: nonEmptyStringSchema.optional()
    }),
    total_found: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    warnings: z.array(nonEmptyStringSchema),
    estimations: z.array(formattedEstimationSchema)
}).refine((result) =>
    result.returned === result.estimations.length && result.total_found >= result.returned,
{
    message: 'Estimation counts do not match the returned resources'
});

export type BusStop = z.infer<typeof busStopSchema>;
export type BusLine = z.infer<typeof busLineSchema>;
export type BusLineStop = z.infer<typeof busLineStopSchema>;
export type BusLineSequence = z.infer<typeof busLineSequenceSchema>;
export type BusEstimation = z.infer<typeof busEstimationSchema>;
export type BusPosition = z.infer<typeof busPositionSchema>;
export type BusVehicle = z.infer<typeof busVehicleSchema>;
export type TusRechargePoint = z.infer<typeof tusRechargePointSchema>;
