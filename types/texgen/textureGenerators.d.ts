/**
 * Compiles a layer spec into a tileable sampler `(u, v) -> { v, cell }`.
 * Applies domain warp, invert, contrast, and bias around the raw generator.
 */
export function compileTextureLayer(spec: any, seed: any, salt: any): (u0: any, v0: any) => {
    v: any;
    cell: any;
};
export const TEXTURE_GENERATORS: Readonly<{
    fbm: {
        label: string;
        category: string;
        uses: string[];
        compile: (params: any, seed: any) => (u: any, v: any) => {
            v: any;
            cell: any;
        };
    };
    billow: {
        label: string;
        category: string;
        uses: string[];
        compile: (params: any, seed: any) => (u: any, v: any) => {
            v: any;
            cell: any;
        };
    };
    ridged: {
        label: string;
        category: string;
        uses: string[];
        compile: (params: any, seed: any) => (u: any, v: any) => {
            v: any;
            cell: any;
        };
    };
    turbulence: {
        label: string;
        category: string;
        uses: string[];
        compile: (params: any, seed: any) => (u: any, v: any) => {
            v: any;
            cell: any;
        };
    };
    value: {
        label: string;
        category: string;
        uses: string[];
        compile: (params: any, seed: any) => (u: any, v: any) => {
            v: any;
            cell: any;
        };
    };
    perlin: {
        label: string;
        category: string;
        uses: string[];
        compile: (params: any, seed: any) => (u: any, v: any) => {
            v: any;
            cell: any;
        };
    };
    worley: {
        label: string;
        category: string;
        uses: string[];
        compile: (params: any, seed: any) => (u: any, v: any) => {
            v: any;
            cell: number;
        };
    };
    worleyF2: {
        label: string;
        category: string;
        uses: string[];
        compile: (params: any, seed: any) => (u: any, v: any) => {
            v: any;
            cell: number;
        };
    };
    cells: {
        label: string;
        category: string;
        uses: string[];
        compile: (params: any, seed: any) => (u: any, v: any) => {
            v: any;
            cell: number;
        };
    };
    cracks: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileCracks;
    };
    caustics: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileCaustics;
    };
    speckle: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileSpeckle;
    };
    bricks: {
        label: string;
        category: string;
        uses: string[];
        compile: (p: any, s: any) => (u: any, v: any) => {
            v: any;
            cell: number;
        };
    };
    tiles: {
        label: string;
        category: string;
        uses: string[];
        compile: (p: any, s: any) => (u: any, v: any) => {
            v: any;
            cell: number;
        };
    };
    hex: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileHex;
    };
    checker: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileChecker;
    };
    grid: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileGrid;
    };
    stripes: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileStripes;
    };
    chevron: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileChevron;
    };
    weave: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileWeave;
    };
    basketWeave: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileBasketWeave;
    };
    scales: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileScales;
    };
    dots: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileDots;
    };
    marble: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileMarble;
    };
    woodGrain: {
        label: string;
        category: string;
        uses: string[];
        compile: typeof compileWoodGrain;
    };
    flat: {
        label: string;
        category: string;
        uses: any[];
        compile: typeof compileFlat;
    };
}>;
export const TEXTURE_GENERATOR_IDS: readonly string[];
declare function compileCracks(params: any, seed: any): (u: any, v: any) => {
    v: any;
    cell: number;
};
declare function compileCaustics(params: any, seed: any): (u: any, v: any) => {
    v: any;
    cell: any;
};
declare function compileSpeckle(params: any, seed: any): (u: any, v: any) => {
    v: number;
    cell: number;
};
declare function compileHex(params: any, seed: any): (u: any, v: any) => {
    v: any;
    cell: number;
};
declare function compileChecker(params: any, seed: any): (u: any, v: any) => {
    v: number;
    cell: number;
};
declare function compileGrid(params: any): (u: any, v: any) => {
    v: number;
    cell: any;
};
declare function compileStripes(params: any, seed: any): (u: any, v: any) => {
    v: any;
    cell: number;
};
declare function compileChevron(params: any): (u: any, v: any) => {
    v: number;
    cell: any;
};
declare function compileWeave(params: any, seed: any): (u: any, v: any) => {
    v: any;
    cell: number;
};
declare function compileBasketWeave(params: any, seed: any): (u: any, v: any) => {
    v: any;
    cell: number;
};
declare function compileScales(params: any, seed: any): (u: any, v: any) => {
    v: any;
    cell: number;
};
declare function compileDots(params: any, seed: any): (u: any, v: any) => {
    v: any;
    cell: number;
};
declare function compileMarble(params: any, seed: any): (u: any, v: any) => {
    v: any;
    cell: any;
};
declare function compileWoodGrain(params: any, seed: any): (u: any, v: any) => {
    v: any;
    cell: any;
};
declare function compileFlat(): () => {
    v: number;
    cell: any;
};
export {};
