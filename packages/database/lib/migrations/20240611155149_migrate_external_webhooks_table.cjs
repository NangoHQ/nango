exports.config = { transaction: false };

exports.up = async function (knex) {
    let id = 0;

    while (true) {
        const environments = await knex.select('*').from('_nango_environments').where('id', '>', id).orderBy('id').limit(100);

        if (environments.length === 0) {
            break;
        }

        for (const environment of environments) {
            const { id, webhook_url, webhook_url_secondary, always_send_webhook, send_auth_webhook } = environment;

            await knex('_nango_external_webhooks')
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
};

exports.down = function (knex) {
    return knex('_nango_external_webhooks').delete();
};
