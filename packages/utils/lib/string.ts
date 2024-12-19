import { timingSafeEqual } from 'crypto';

export function stringToHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return hash;
}

export function stringTimingSafeEqual(a: string, b: string): boolean {
    try {
        if (a.length !== b.length) {
            return false;
        }
        return timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
        return false;
    }
}

export function truncateBytes(str: string, maxBytes: number): string {
    const encoder = new TextEncoder();
    if (encoder.encode(str).length <= maxBytes) {
        return str;
    }

    let left = 0;
    let right = str.length;

    // Find how many characters fit within the byte limit
    while (right - left > 1) {
        const mid = Math.floor((left + right) / 2);
        const slice = str.slice(0, mid);
        const bytes = encoder.encode(slice).length;

        if (bytes <= maxBytes) {
            left = mid;
        } else {
            right = mid;
        }
    }

    let result = str.slice(0, left);

    // Making sure we haven't truncated in the middle of a multi-bytes character
    // by reducing length until we can encode the string
    while (left > 0) {
        try {
            encodeURIComponent(result);
            break;
        } catch {
            left--;
            result = str.slice(0, left);
        }
    }

    return result;
}
