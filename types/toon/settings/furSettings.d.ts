export function createFurSettings(options?: any): {
    density: any;
    enabled: boolean;
    gravity: any;
    length: any;
    materials: any[];
    roles: string[];
    rootOffset: any;
    rootShade: any;
    shellCount: number;
};
export function materialUsesFur(settings: any, sourceMaterial: any, roleInfo?: any): boolean;
export const DEFAULT_FUR_SETTINGS: Readonly<{
    enabled: false;
    shellCount: 8;
    length: 0.02;
    gravity: 0.35;
    density: 3;
    rootOffset: -0.2;
    rootShade: 0.55;
    materials: any;
    roles: any;
}>;
