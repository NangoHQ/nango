import './loadEnv.js';
import { database } from '@nangohq/database';

async function migrate() {
    console.log('Starting webhook settings migration...');

    let id = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const environments = await database.knex.select('*').from('_nango_environments').where('id', '>', id).orderBy('id').limit(1000);

        if (environments.length === 0) {
            break;
        }

        for (const environment of environments) {
            const { id, webhook_url, webhook_url_secondary, always_send_webhook, send_auth_webhook } = environment;

            await database
                .knex('_nango_external_webhooks')
                .insert({
                    environment_id: id,
                    primary_url: webhook_url,
                    secondary_url: webhook_url_secondary,
                    on_sync_completion_always: always_send_webhook,
                    on_auth_creation: send_auth_webhook
                })
                .onConflict('environment_id')
                .merge();
        }

        id = environments[environments.length - 1].id;
    }
}

const start = new Date();

migrate()
    .catch((err: unknown) => {
        console.error('Error occurred during webhook settings migration:', err);
        process.exit(1);
    })
    .finally(() => {
        const end = new Date();
        console.log('Execution took:', (end.getTime() - start.getTime()) / 1000, 's');
        process.exit(0);
    });
