import { createHash } from 'node:crypto';

const CATALOG_FUNCTION_UUID_PREFIX = 'ca7a10c0';

const namespace = 'nango:catalog-function:v1';
const catalogFunctionUuidPattern = new RegExp(`^${CATALOG_FUNCTION_UUID_PREFIX}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`);

// Derive the default catalog identity from provider and public name, independently of the content version.
export function generateCatalogFunctionUuid({ provider, name }: { provider: string; name: string }): string {
    if (!provider || !name) {
        throw new Error('Catalog function UUID generation requires a provider and name');
    }

    const bytes = createHash('sha256')
        .update(JSON.stringify([namespace, provider, name]))
        .digest()
        .subarray(0, 16);
    Buffer.from(CATALOG_FUNCTION_UUID_PREFIX, 'hex').copy(bytes);
    bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x80, 6);
    bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);

    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isCatalogFunctionUuid(value: unknown): value is string {
    return typeof value === 'string' && catalogFunctionUuidPattern.test(value);
}
