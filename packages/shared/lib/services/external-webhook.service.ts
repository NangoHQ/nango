import db from '@nangohq/database';

import type { DBExternalWebhook } from '@nangohq/types';
import type { Knex } from 'knex';

export async function get(id: number): Promise<DBExternalWebhook | null> {
    const result = await db.knex.select('*').from<DBExternalWebhook>('_nango_external_webhooks').where({ environment_id: id }).first();

    return result || null;
}

export async function update(
    trx: Knex,
    {
        environment_id,
        data
    }: {
        trx?: Knex;
        environment_id: number;
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
        >;
    }
): Promise<void> {
    await trx
        .from<DBExternalWebhook>('_nango_external_webhooks')
        .insert({
            environment_id,
            ...data
        })
        .onConflict('environment_id')
        .merge();
}
