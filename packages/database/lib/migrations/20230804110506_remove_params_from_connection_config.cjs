/**
 * Connection config params
 * @desc 1) Grab connection config that isn't null or {}
 *       2) If it has a connectionConfig.params[string] key remove the params key and move the value to connectionConfig[string]
 */
const DB_TABLE = '_nango_connections';

exports.up = async function (knex) {
    const existingCC = await knex.select('id', 'connection_config').from(DB_TABLE).whereNotNull('connection_config').andWhere('connection_config', '!=', '{}');

    for (const record of existingCC) {
        const { id, connection_config } = record;
        /**
         * connection_config looks like this:
         * {"instance_url":"https://datachimp-dev-ed.develop.my.salesforce.com","connectionConfig.params.subdomain":"pl-test-store-1"}
         */
        for (const key of Object.keys(connection_config)) {
            if (key.includes('connectionConfig.params.')) {
                const newKey = key.replace('connectionConfig.params.', '');
                connection_config[newKey] = connection_config[key];
                delete connection_config[key];

                await knex.update({ connection_config }).from(DB_TABLE).where({ id });
            }
        }
    }

    return Promise.resolve();
};

exports.down = async function () {
    return Promise.resolve();
};
