import db from '@nangohq/database';
import type { ExternalWebhook, WebhookSettings } from '@nangohq/types';

export async function get(id: number): Promise<ExternalWebhook | null> {
    const result = await db.knex.select('*').from<ExternalWebhook>('_nango_external_webhooks').where({ environment_id: id }).first();

    return result || null;
}

export async function update(id: number, data: WebhookSettings): Promise<void> {
    await db.knex.from<ExternalWebhook>('_nango_external_webhooks').where({ environment_id: id }).update({
        on_sync_completion_always: data.alwaysSendWebhook,
        on_auth_creation: data.sendAuthWebhook,
        on_auth_refresh_error: data.sendRefreshFailedWebhook,
        on_sync_error: data.sendSyncFailedWebhook
    });
}

export async function updatePrimaryUrl(id: number, primaryUrl: string): Promise<void> {
    await db.knex.from<ExternalWebhook>('_nango_external_webhooks').where({ environment_id: id }).update({ primary_url: primaryUrl });
}

export async function updateSecondaryUrl(id: number, secondaryUrl: string): Promise<void> {
    await db.knex.from<ExternalWebhook>('_nango_external_webhooks').where({ environment_id: id }).update({ secondary_url: secondaryUrl });
}
