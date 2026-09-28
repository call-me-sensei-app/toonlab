/**
 * ArrayBuffer/Uint8Array of a .zip → [{ name, data: Uint8Array }] for every
 * file entry (directories skipped), via the central directory.
 */
export function readZipEntries(input: any): Promise<{
    data: Uint8Array<ArrayBuffer>;
    name: string;
}[]>;
