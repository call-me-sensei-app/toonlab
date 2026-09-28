/**
 * Compiles a document into `{ evaluate(x, y, z), bounds, revision }`.
 * Results are cached per document object and invalidated by `revision`,
 * so repeated meshing while dragging one slider recompiles only once per
 * document mutation.
 *
 * @param {object} document Rock document (rockDocument.js shape).
 * @param {{ includeHelpers?: boolean, pieceId?: string }} [options]
 *   `pieceId` restricts to a single piece, evaluated in its LOCAL space
 *   (transform ignored) — used by the lab's per-piece preview mode where
 *   the transform lives on the scene group. `includeHelpers` keeps
 *   construction-only supports for authoring calculations; visual meshing
 *   and walker collision pass false so they match the final rock.
 */
export function compileDocument(document: object, { includeHelpers, pieceId }?: {
    includeHelpers?: boolean;
    pieceId?: string;
}): any;
/** Evaluates the document (or a precompiled program) at one point. */
export function evaluateField(fieldProgramOrDocument: any, x: any, y: any, z: any): any;
