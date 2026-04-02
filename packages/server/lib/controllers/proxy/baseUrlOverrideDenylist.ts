/**
 * Normalize a denylist entry to a lowercase hostname for comparison.
 * Accepts bare hostnames/IPs or full URLs (uses URL.hostname when `://` is present).
 */
export function normalizeDenylistHost(entry: string): string {
    const trimmed = entry.trim();
    if (!trimmed) {
        return '';
    }
    if (trimmed.includes('://')) {
        try {
            return new URL(trimmed).hostname.toLowerCase();
        } catch {
            return trimmed.toLowerCase();
        }
    }
    return trimmed.toLowerCase();
}

export function normalizeDenylist(denylist: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const e of denylist) {
        const h = normalizeDenylistHost(e);
        if (h && !seen.has(h)) {
            seen.add(h);
            out.push(h);
        }
    }
    return out;
}

export function isBaseUrlOverrideDenied(overrideUrl: string, denylist: string[]): boolean {
    let hostname: string;
    try {
        hostname = new URL(overrideUrl).hostname.toLowerCase();
    } catch {
        return false;
    }
    const denied = normalizeDenylist(denylist);
    return denied.includes(hostname);
}
