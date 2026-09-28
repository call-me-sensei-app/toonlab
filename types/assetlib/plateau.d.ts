/**
 * Official catalog payload -> one best building dataset per municipality or
 * ward. Highest LOD wins; texture wins within the same LOD. Stable `latest`
 * URLs keep saved refs current when PLATEAU publishes a new survey year.
 */
export function normalizePlateauBuildingDatasets(payload: any): {
    attribution: Readonly<{
        text: string;
        license: "PDL 1.0 / CC BY 4.0 compatible";
        requiresAttribution: true;
        sourceLabel: "Project PLATEAU";
        sourceUrl: "https://www.mlit.go.jp/plateau/opendata/";
    }>;
    authors: string[];
    categories: string[];
    citygml: {
        featureTypes: any[];
        sizeBytes: number;
        url: any;
    };
    download: {
        format: string;
        resources: {};
        sizeBytes: number;
        url: any;
    };
    id: string;
    kind: string;
    metadata: {
        catalogId: any;
        city: any;
        cityCode: any;
        dataYear: number;
        format: any;
        formatVersion: any;
        lod: number;
        payloadType: string;
        prefecture: any;
        prefectureCode: any;
        textured: boolean;
        ward: any;
        wardCode: any;
    };
    name: string;
    openAccess: boolean;
    pageUrl: string;
    source: string;
    streamOnly: boolean;
    tags: string[];
    thumbnailUrl: any;
}[];
/** Fetch and normalize the live official catalog once per browser/Node process. */
export function fetchPlateauBuildingIndex({ apiUrl, fetchImpl, headers, }?: {
    apiUrl?: string;
    fetchImpl?: typeof fetch;
    headers?: {};
}): any;
export const PLATEAU_CATALOG_API_URL: "https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets";
export const PLATEAU_OPEN_DATA_URL: "https://www.mlit.go.jp/plateau/opendata/";
export const PLATEAU_SITE_POLICY_URL: "https://www.mlit.go.jp/plateau/site-policy/";
export const PLATEAU_LICENSE: "PDL 1.0 / CC BY 4.0 compatible";
export const PLATEAU_ATTRIBUTION: Readonly<{
    license: "PDL 1.0 / CC BY 4.0 compatible";
    requiresAttribution: true;
    sourceLabel: "Project PLATEAU";
    sourceUrl: "https://www.mlit.go.jp/plateau/opendata/";
}>;
