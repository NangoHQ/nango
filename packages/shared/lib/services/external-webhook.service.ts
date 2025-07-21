import db from '@nangohq/database';

import type { DBExternalWebhook } from '@nangohq/types';

export async function get(id: number): Promise<DBExternalWebhook | null> {
    const result = await db.knex.select('*').from<DBExternalWebhook>('_nango_external_webhooks').where({ environment_id: id }).first();

    return result || null;
}

export async function update(
    environment_id: number,
    data: Partial<
        Pick<
            DBExternalWebhook,
            | 'primary_url'
            | 'secondary_url'
            | 'on_auth_creation'
            | 'on_auth_refresh_error'
            | 'on_sync_completion_always'
            | 'on_sync_error'
            | 'on_async_action_completion'
        >
    >
): Promise<void> {
    await db.knex
        .from<DBExternalWebhook>('_nango_external_webhooks')
        .insert({
            environment_id,
            ...data
        })
        .onConflict('environment_id')
        .merge();
}
