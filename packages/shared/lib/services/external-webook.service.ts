import db from '@nangohq/database';
import type { ExternalWebhook } from '@nangohq/types';

export async function get(id: number): Promise<ExternalWebhook | null> {
    const result = await db.knex.select('*').from<ExternalWebhook>('_nango_external_webhooks').where({ environment_id: id }).first();

    return result || null;
}
