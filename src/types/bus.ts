export interface BusStop {
    'wgs84_pos:long'?: string;
    'ayto:coordY_ETRS89'?: string;
    'ayto:numero'?: string;
    'gn:coordY'?: string;
    'gn:coordX'?: string;
    'ayto:sentido'?: string;
    'vivo:address1'?: string;
    'ayto:coordX_ETRS89'?: string;
    'dc:modified'?: string;
    'wgs84_pos:lat'?: string;
    'ayto:parada'?: string;
    'dc:identifier'?: string;
    uri?: string;
    [key: string]: any;
}

export interface BusLine {
    'ayto:numero'?: string;
    'dc:name'?: string;
    'dc:modified'?: string;
    'dc:identifier'?: string;
    uri?: string;
    [key: string]: any;
}

export interface BusLineStop {
    'wgs84_pos:long'?: string;
    'gn:coordY'?: string;
    'gn:coordX'?: string;
    'ayto:linea'?: string;
    'dc:modified'?: string;
    'wgs84_pos:lat'?: string;
    'ayto:parada'?: string;
    'dc:identifier'?: string;
    uri?: string;
    [key: string]: any;
}

export interface BusEstimation {
    'ayto:tiempo1'?: string;
    'ayto:distancia2'?: string;
    'ayto:destino1'?: string;
    'ayto:distancia1'?: string;
    'ayto:tiempo2'?: string;
    'ayto:paradaId'?: string;
    'ayto:destino2'?: string;
    'ayto:fechActual'?: string;
    'dc:modified'?: string;
    'dc:identifier'?: string;
    'ayto:etiqLinea'?: string;
    uri?: string;
    [key: string]: any;
}

export interface ApiResponse<T> {
    summary: {
        items: number;
        items_per_page: number;
        pages: number;
        current_page: number;
    };
    resources: T[];
}

export type BusStopsResponse = ApiResponse<BusStop>;
export type BusLinesResponse = ApiResponse<BusLine>;
export type BusLineStopsResponse = ApiResponse<BusLineStop>;
export type BusEstimationsResponse = ApiResponse<BusEstimation>;
