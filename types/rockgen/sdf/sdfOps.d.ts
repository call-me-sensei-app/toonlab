export function opUnion(a: any, b: any): number;
export function opIntersect(a: any, b: any): number;
export function opSubtract(a: any, b: any): number;
export function opSmoothUnion(a: any, b: any, k: any): number;
export function opSmoothIntersect(a: any, b: any, k: any): number;
export function opSmoothSubtract(a: any, b: any, k: any): number;
/** Applies a named combine op ('union'|'smoothUnion'|'subtract'|'intersect'). */
export function combine(op: any, a: any, b: any, blend: any): number;
