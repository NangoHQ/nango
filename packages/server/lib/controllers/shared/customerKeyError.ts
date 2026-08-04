export type CustomerKeyErrorType = 'duplicate_api_key' | 'resource_capped' | 'no_such_api_secret' | 'unknown';

export function getCustomerKeyErrorType(err: unknown): CustomerKeyErrorType {
    if (!err || typeof err !== 'object' || !('type' in err)) {
        return 'unknown';
    }

    const rawType = (err as { type?: unknown }).type;
    if (typeof rawType !== 'string') {
        return 'unknown';
    }

    // NangoError prefixes types that are not in its legacy catalog with "unhandled_".
    const type = rawType.startsWith('unhandled_') ? rawType.slice('unhandled_'.length) : rawType;
    if (type === 'duplicate_api_key' || type === 'resource_capped' || type === 'no_such_api_secret') {
        return type;
    }

    return 'unknown';
}
