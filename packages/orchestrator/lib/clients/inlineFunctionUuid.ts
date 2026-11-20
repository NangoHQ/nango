import { randomUUID } from 'node:crypto';

const INLINE_FUNCTION_UUID_PREFIX = '1c0de000';

const inlineFunctionUuidPattern = new RegExp(`^${INLINE_FUNCTION_UUID_PREFIX}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`);

// An inline function has no stored identity, so each run gets its own uuid under a prefix no deployed function uses.
export function generateInlineFunctionUuid(): string {
    return `${INLINE_FUNCTION_UUID_PREFIX}${randomUUID().slice(INLINE_FUNCTION_UUID_PREFIX.length)}`;
}

export function isInlineFunctionUuid(value: unknown): value is string {
    return typeof value === 'string' && inlineFunctionUuidPattern.test(value);
}
