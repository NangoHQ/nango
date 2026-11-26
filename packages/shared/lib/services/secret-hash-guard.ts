import net from 'node:net';

import { FixedSizeMap, metrics, TTLFixedSizeMap } from '@nangohq/utils';

/**
 * Derivations that matched no stored key, per client, before that client is refused further
 * derivations until its window ends. In-flight derivations count too, so parallel requests
 * cannot overshoot it.
 */
export const MAX_UNMATCHED_SECRET_DERIVATIONS_PER_CLIENT = 4;
const UNMATCHED_WINDOW_MS = 60_000;
const UNMATCHED_HASH_TTL_MS = 10 * 60_000;

/**
 * Each derivation holds a libuv thread-pool worker for its full duration. Keep at least half of
 * the pool free for everything else on the process (DNS, fs, zlib, login hashing).
 */
const MAX_CONCURRENT_DERIVATIONS = Math.max(1, Math.floor((Number(process.env['UV_THREADPOOL_SIZE']) || 4) / 2));

export class SecretHashThrottledError extends Error {
    constructor() {
        super('secret_hash_throttled');
        this.name = 'SecretHashThrottledError';
    }
}

class Semaphore {
    private active = 0;
    private readonly waiting: (() => void)[] = [];

    constructor(private readonly max: number) {}

    async run<T>(fn: () => Promise<T>): Promise<T> {
        if (this.active < this.max) {
            this.active += 1;
        } else {
            // The releasing caller hands its slot over, so `active` is not incremented here.
            await new Promise<void>((resolve) => this.waiting.push(resolve));
        }
        try {
            return await fn();
        } finally {
            const next = this.waiting.shift();
            if (next) {
                next();
            } else {
                this.active -= 1;
            }
        }
    }
}

/**
 * Per-client budget key. IPv4-mapped addresses collapse to IPv4, and IPv6 addresses to their /64,
 * since a single host is routinely handed a whole /64.
 */
export function secretHashClientKey(ip: string | undefined): string | undefined {
    if (!ip) {
        return undefined;
    }
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
    if (mapped?.[1]) {
        return mapped[1];
    }
    const address = ip.split('%')[0] ?? ip;
    if (!net.isIPv6(address)) {
        return ip;
    }
    const [head = '', tail] = address.split('::');
    const headGroups = head ? head.split(':') : [];
    const tailGroups = tail ? tail.split(':') : [];
    const groupCount = (groups: string[]) => groups.reduce((count, group) => count + (group.includes('.') ? 2 : 1), 0);
    const groups =
        tail === undefined ? headGroups : [...headGroups, ...Array<string>(8 - groupCount(headGroups) - groupCount(tailGroups)).fill('0'), ...tailGroups];
    const prefix = groups
        .slice(0, 4)
        .map((group) => (group.includes('.') ? group : parseInt(group, 16).toString(16)))
        .join(':');
    return `${prefix}::/64`;
}

/**
 * Gate for deriving a slow hash from a caller-supplied secret before looking it up.
 *
 * - A secret whose hash matched a stored key is cached and never derived again.
 * - A secret whose hash matched nothing is cached for a while too, so repeating it costs a lookup, not a derivation.
 * - Concurrent requests for the same secret share one derivation.
 * - A client that has produced MAX_UNMATCHED_SECRET_DERIVATIONS_PER_CLIENT unmatched derivations in
 *   the window gets SecretHashThrottledError instead of a new derivation.
 * - At most MAX_CONCURRENT_DERIVATIONS run at once; the rest queue.
 */
export class SecretHashGuard {
    private readonly matched = new FixedSizeMap<string, string>(10_000);
    private readonly unmatched = new TTLFixedSizeMap<string, string>(10_000, UNMATCHED_HASH_TTL_MS);
    private readonly inflight = new Map<string, Promise<string>>();
    private readonly clientInflight = new Map<string, number>();
    private readonly clientUnmatched = new TTLFixedSizeMap<string, number>(50_000, UNMATCHED_WINDOW_MS);
    private readonly derivations = new Semaphore(MAX_CONCURRENT_DERIVATIONS);

    constructor(private readonly derive: (secret: string) => Promise<string>) {}

    /**
     * Resolves `secret` through `find`, which receives the derived hash and returns null when no
     * stored key has it. `clientIp` is the caller's address; without it no per-client budget applies.
     */
    async lookup<T>(secret: string, clientIp: string | undefined, find: (hash: string) => Promise<T | null>): Promise<T | null> {
        const matched = this.matched.get(secret);
        if (matched) {
            metrics.increment(metrics.Types.AUTH_SECRET_KEY_HASH_CACHE, 1, { result: 'hit' });
            return await find(matched);
        }

        const unmatched = this.unmatched.get(secret);
        if (unmatched) {
            metrics.increment(metrics.Types.AUTH_SECRET_KEY_HASH_CACHE, 1, { result: 'unmatched_hit' });
            return await this.findAndRecord(secret, unmatched, find);
        }

        const pending = this.inflight.get(secret);
        if (pending) {
            metrics.increment(metrics.Types.AUTH_SECRET_KEY_HASH_CACHE, 1, { result: 'inflight' });
            return await this.findAndRecord(secret, await pending, find);
        }

        const client = secretHashClientKey(clientIp);
        if (client && !this.reserve(client)) {
            metrics.increment(metrics.Types.AUTH_SECRET_KEY_HASH_CACHE, 1, { result: 'throttled' });
            throw new SecretHashThrottledError();
        }
        metrics.increment(metrics.Types.AUTH_SECRET_KEY_HASH_CACHE, 1, { result: 'miss' });

        let outcome: 'matched' | 'unmatched' | 'error' = 'error';
        try {
            const derivation = this.derivations.run(() => this.derive(secret));
            this.inflight.set(secret, derivation);
            let hash: string;
            try {
                hash = await derivation;
            } finally {
                this.inflight.delete(secret);
            }
            const found = await this.findAndRecord(secret, hash, find);
            outcome = found === null ? 'unmatched' : 'matched';
            return found;
        } finally {
            if (client) {
                this.settle(client, outcome);
            }
        }
    }

    private async findAndRecord<T>(secret: string, hash: string, find: (hash: string) => Promise<T | null>): Promise<T | null> {
        const found = await find(hash);
        if (found !== null) {
            this.matched.set(secret, hash);
        } else if (!this.matched.has(secret)) {
            this.unmatched.set(secret, hash);
        }
        return found;
    }

    private reserve(client: string): boolean {
        const inflight = this.clientInflight.get(client) ?? 0;
        const unmatched = this.clientUnmatched.get(client) ?? 0;
        if (inflight + unmatched >= MAX_UNMATCHED_SECRET_DERIVATIONS_PER_CLIENT) {
            return false;
        }
        this.clientInflight.set(client, inflight + 1);
        return true;
    }

    private settle(client: string, outcome: 'matched' | 'unmatched' | 'error'): void {
        const inflight = (this.clientInflight.get(client) ?? 1) - 1;
        if (inflight > 0) {
            this.clientInflight.set(client, inflight);
        } else {
            this.clientInflight.delete(client);
        }
        if (outcome !== 'unmatched') {
            return;
        }
        // The window stays anchored at the client's first failure rather than sliding on every one.
        const remainingMs = this.clientUnmatched.remainingMs(client);
        const unmatched = remainingMs > 0 ? (this.clientUnmatched.get(client) ?? 0) : 0;
        this.clientUnmatched.set(client, unmatched + 1, remainingMs > 0 ? remainingMs : UNMATCHED_WINDOW_MS);
    }
}
