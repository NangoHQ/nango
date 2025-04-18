import type { ApiWebhooks, DBExternalWebhook } from '@nangohq/types';

export function webhooksToApi({ id, environment_id, ...webhooks }: DBExternalWebhook): ApiWebhooks {
    return {
        ...webhooks
    };
}
