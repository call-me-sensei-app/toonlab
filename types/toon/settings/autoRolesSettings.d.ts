export function createAutoRolesSettings(options?: any): {
    mode: any;
    skinTolerance: number;
};
export const AUTO_ROLE_MODES: Readonly<{
    auto: "auto";
    off: "off";
    precomputed: "precomputed";
}>;
export const DEFAULT_AUTO_ROLES_SETTINGS: Readonly<{
    mode: "auto";
    skinTolerance: 0.07;
}>;
