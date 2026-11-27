import { randomBytes } from 'node:crypto';

import { prefixedUuidV8 } from '@nangohq/utils';

const inlineFunctionUuids = prefixedUuidV8('1c0de000');

export function generateInlineFunctionUuid(): string {
    return inlineFunctionUuids.fromBytes(randomBytes(16));
}

export function isInlineFunctionUuid(value: unknown): value is string {
    return typeof value === 'string' && inlineFunctionUuids.matches(value.toLowerCase());
}
