import { randomBytes } from 'node:crypto';

const INLINE_FUNCTION_UUID_PREFIX = '1c0de000';

// Version 8 keeps inline uuids apart from the random v4 uuids of deployed functions.
const inlineFunctionUuidPattern = new RegExp(`^${INLINE_FUNCTION_UUID_PREFIX}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, 'i');

export function generateInlineFunctionUuid(): string {
    const bytes = randomBytes(16);
    Buffer.from(INLINE_FUNCTION_UUID_PREFIX, 'hex').copy(bytes);
    bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x80, 6);
    bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);

    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isInlineFunctionUuid(value: unknown): value is string {
    return typeof value === 'string' && inlineFunctionUuidPattern.test(value);
}
