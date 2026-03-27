import { Daytona } from '@daytonaio/sdk';

import { envs } from '../../env.js';

let daytonaClient: Daytona | null = null;

export function getDaytonaClient(): Daytona {
    if (!envs.DAYTONA_API_KEY) {
        throw new Error('DAYTONA_API_KEY is required when using Daytona-backed runtimes');
    }

    if (!daytonaClient) {
        const config: { apiKey: string; apiUrl?: string; target?: string } = {
            apiKey: envs.DAYTONA_API_KEY
        };

        if (envs.DAYTONA_API_URL) {
            config.apiUrl = envs.DAYTONA_API_URL;
        }

        if (envs.DAYTONA_TARGET) {
            config.target = envs.DAYTONA_TARGET;
        }

        daytonaClient = new Daytona(config);
    }

    return daytonaClient;
}
