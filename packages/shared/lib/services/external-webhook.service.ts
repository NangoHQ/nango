import db from '@nangohq/database';
import type { DBExternalWebhook, DBEnvironment } from '@nangohq/types';

export async function get(id: number): Promise<DBExternalWebhook | null> {
    // First, get the environment information so we can check if there is a related env var by its name
    const environment = await db.knex.select('name').from<DBEnvironment>('_nango_environments').where({ id }).first();

    // Now get the webhook settings
    const result = await db.knex.select('*').from<DBExternalWebhook>('_nango_external_webhooks').where({ environment_id: id }).first();

    // Apply environment variable for primary_url, if it exists
    if (result && environment) {
        if (process.env[`NANGO_WEBHOOK_PRIMARY_URL_${environment.name.toUpperCase()}`]) {
            result.primary_url = process.env[`NANGO_WEBHOOK_PRIMARY_URL_${environment.name.toUpperCase()}`] as string;
        }
    }

    return result || null;
}

export async function update(
    environment_id: number,
    data: Partial<
        Pick<DBExternalWebhook, 'primary_url' | 'secondary_url' | 'on_auth_creation' | 'on_auth_refresh_error' | 'on_sync_completion_always' | 'on_sync_error'>
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
