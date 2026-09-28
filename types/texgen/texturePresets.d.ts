export function findTexturePreset(id: any): Readonly<{
    category: any;
    id: any;
    label: any;
    settings: any;
    tags: any;
}>;
export const TEXTURE_PRESET_CATEGORIES: readonly (Readonly<{
    id: "stone";
    label: "Stone & masonry";
}> | Readonly<{
    id: "ground";
    label: "Ground & terrain";
}> | Readonly<{
    id: "wood";
    label: "Wood";
}> | Readonly<{
    id: "metal";
    label: "Metal";
}> | Readonly<{
    id: "fabric";
    label: "Fabric & leather";
}> | Readonly<{
    id: "ceramic";
    label: "Ceramic & man-made";
}> | Readonly<{
    id: "organic";
    label: "Organic & creature";
}> | Readonly<{
    id: "liquid";
    label: "Liquid, ice & fire";
}> | Readonly<{
    id: "scifi";
    label: "Sci-fi & glow";
}> | Readonly<{
    id: "stylized";
    label: "Stylized & graphic";
}>)[];
export const BUILT_IN_TEXTURE_PRESETS: readonly Readonly<{
    category: any;
    id: any;
    label: any;
    settings: any;
    tags: any;
}>[];
