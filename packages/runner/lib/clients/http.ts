import { logger } from '../logger.js';

import type { RequestInfo } from 'undici/types/index.js';

export async function httpFetch(resource: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await fetch(resource, init);
    if (res.status >= 400) {
        let content;
        if (res.headers.get('content-type')?.includes('application/json')) {
            content = await res.json().catch(() => 'Cannot parse response as JSON.');
        } else {
            content = await res.text();
        }
        logger.error(`Error: ${init?.method} ${resource as string} -> ${res.status} ${JSON.stringify(content)}`);
    }
    return res;
}
