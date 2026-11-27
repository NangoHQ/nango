export interface PrefixedUuidV8 {
    fromBytes: (bytes: Uint8Array) => string;
    matches: (value: unknown) => value is string;
}

// A version 8 uuid that starts with a fixed 8 hex prefix, so its kind can be read from the uuid alone and never collides with a random v4.
export function prefixedUuidV8(prefix: string): PrefixedUuidV8 {
    if (!/^[0-9a-f]{8}$/.test(prefix)) {
        throw new Error('The uuid prefix must be 8 lowercase hex characters');
    }
    const pattern = new RegExp(`^${prefix}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`);

    return {
        fromBytes: (source) => {
            if (source.length < 16) {
                throw new Error('A uuid needs 16 bytes');
            }
            const bytes = Buffer.from(source.subarray(0, 16));
            Buffer.from(prefix, 'hex').copy(bytes);
            bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x80, 6);
            bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);

            const hex = bytes.toString('hex');
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        },
        matches: (value): value is string => typeof value === 'string' && pattern.test(value)
    };
}
