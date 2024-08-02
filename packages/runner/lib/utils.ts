import { getLogger, stringifyError } from '@nangohq/utils';

export const logger = getLogger('Runner');

export async function httpFetch({ method, url, data = undefined }: { method: string; url: string; data?: string }): Promise<void> {
    try {
        const res = await fetch(url, {
            method: method,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            ...(data && { body: data })
        });
        if (res.status > 299) {
            let resp;
            if (res.headers.get('content-type')?.includes('application/json')) {
                resp = await res.json().catch(() => 'Cannot parse response as JSON.');
            } else {
                resp = await res.text();
            }
            logger.error(`Error: ${method} ${url}: status=${res.status}, response=${JSON.stringify(resp)}`);
        }
    } catch (err) {
        logger.error(`Error: ${method} ${url}: ${stringifyError(err)}`);
    }
}
