import { getJobsUrl } from '@nangohq/shared';
import { retryWithBackoff } from '@nangohq/utils';

import type { NangoProps } from '@nangohq/types';

export async function updateTask({
    taskId,
    nangoProps,
    isSuccess,
    output
}: {
    taskId: string;
    nangoProps: NangoProps;
    isSuccess: boolean;
    output: any;
}): Promise<Response> {
    const url = `${getJobsUrl()}/tasks/${taskId}`;
    const init = {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            nangoProps: nangoProps,
            ...(isSuccess ? { output } : { error: output })
        })
    };
    try {
        const response = await retryWithBackoff(async () => {
            let res: Response;
            try {
                res = await fetch(url, init);
            } catch (err) {
                console.error(`${init.method} ${url.toString()} -> ${(err as Error).message}`);
                throw err;
            }

            if (!res.ok) {
                console.error(`${init.method} ${url.toString()} -> ${res.status} ${res.statusText}`);
            }

            // Retry only on 5xx or 429 responses
            if (res.status >= 500 || res.status === 429) {
                throw new Error(`${init.method} ${url.toString()} -> ${res.status} ${res.statusText}`);
            }

            return res;
        });

        return response;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: message }), {
            status: 599,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
