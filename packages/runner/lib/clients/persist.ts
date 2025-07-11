import { getPersistAPIUrl } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { httpFetch } from './http.js';

import type { PostLog } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

class PersistClient {
    private baseUrl: string;

    constructor({ baseUrl }: { baseUrl: string }) {
        this.baseUrl = baseUrl;
    }

    async postLog({ data, secretKey, environmentId }: PostLog['Params'] & { data: PostLog['Body']; secretKey: string }): Promise<Result<PostLog['Success']>> {
        const resp = await httpFetch(`${this.baseUrl}/environment/${environmentId}/log`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${secretKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        if (!resp.ok) {
            return Err(`postLog_failed`);
        }
        return Ok(undefined as PostLog['Success']);
    }
}

export const persistClient = new PersistClient({ baseUrl: getPersistAPIUrl() });
