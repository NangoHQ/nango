import db from '@nangohq/database';
import type { ExternalWebhook, WebhookSettings } from '@nangohq/types';

export async function get(id: number): Promise<ExternalWebhook | null> {
    const result = await db.knex.select('*').from<ExternalWebhook>('_nango_external_webhooks').where({ environment_id: id }).first();

    return result || null;
}

export async function update(environment_id: number, data: WebhookSettings): Promise<void> {
    await db.knex
        .from<ExternalWebhook>('_nango_external_webhooks')
        .insert({
            environment_id,
            on_sync_completion_always: data.alwaysSendWebhook,
            on_auth_creation: data.sendAuthWebhook,
            on_auth_refresh_error: data.sendRefreshFailedWebhook,
            on_sync_error: data.sendSyncFailedWebhook
        })
        .onConflict('environment_id')
        .merge();
}

export async function updatePrimaryUrl(environment_id: number, primaryUrl: string): Promise<void> {
    await db.knex.from<ExternalWebhook>('_nango_external_webhooks').insert({ environment_id, primary_url: primaryUrl }).onConflict('environment_id').merge();
}

export async function updateSecondaryUrl(environment_id: number, secondaryUrl: string): Promise<void> {
    await db.knex
        .from<ExternalWebhook>('_nango_external_webhooks')
        .insert({ environment_id, secondary_url: secondaryUrl })
        .onConflict('environment_id')
        .merge();
}
