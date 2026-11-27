import { createHash } from 'node:crypto';

import { prefixedUuidV8 } from '@nangohq/utils';

const catalogFunctionUuids = prefixedUuidV8('ca7a10c0');

const namespace = 'nango:catalog-function:v1';

// Derive the default catalog identity from provider and public name, independently of the content version.
export function generateCatalogFunctionUuid({ provider, name }: { provider: string; name: string }): string {
    if (!provider || !name) {
        throw new Error('Catalog function UUID generation requires a provider and name');
    }

    return catalogFunctionUuids.fromBytes(
        createHash('sha256')
            .update(JSON.stringify([namespace, provider, name]))
            .digest()
    );
}

export function isCatalogFunctionUuid(value: unknown): value is string {
    return catalogFunctionUuids.matches(value);
}
