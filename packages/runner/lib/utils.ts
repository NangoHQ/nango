import { getLogger, stringifyError } from '@nangohq/utils';

export const logger = getLogger('Runner');

export async function httpFetch({ method, url, data }: { method: string; url: string; data: string }): Promise<void> {
    try {
        const res = await fetch(url, {
            method: method,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: data
        });
        if (res.status > 299) {
            logger.error(`Error (status=${res.status}) sending '${data}' to '${url}': ${JSON.stringify(await res.json())}`);
        }
    } catch (err) {
        logger.error(`Error sending '${data}' to '${url}': ${stringifyError(err)}`);
    }
}
