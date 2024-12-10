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
