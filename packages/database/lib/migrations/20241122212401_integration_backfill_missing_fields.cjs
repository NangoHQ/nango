const path = require('node:path');
const fs = require('node:fs');
const yaml = require('js-yaml');

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    let providers;
    const providersPath = path.join(__dirname, '..', '..', '..', 'providers', 'providers.yaml');
    try {
        providers = yaml.load(fs.readFileSync(providersPath, 'utf8'));
    } catch (err) {
        console.error(
            `Warning: Failed to load providers.yaml. Skipping migration. Missing fields on existing integrations will not show warnings in the dashboard until they are saved again. Underlying error: ${err.message}. `
        );
        return;
    }

    const needsClientId = ['OAUTH1', 'OAUTH2', 'TBA', 'APP'];
    const clientIdProviders = Object.entries(providers)
        .filter(([, config]) => needsClientId.includes(config.auth_mode))
        .map(([name]) => name);
    await knex
        .queryBuilder()
        .from('_nango_configs')
        .whereIn('provider', clientIdProviders)
        .whereRaw("NOT (missing_fields @> '{oauth_client_id}')")
        .where('oauth_client_id', null)
        .update({ missing_fields: knex.raw("array_append(missing_fields, 'oauth_client_id')") });

    const needsClientSecret = ['OAUTH1', 'OAUTH2', 'TBA', 'APP'];
    const clientSecretProviders = Object.entries(providers)
        .filter(([, config]) => needsClientSecret.includes(config.auth_mode))
        .map(([name]) => name);
    await knex
        .queryBuilder()
        .from('_nango_configs')
        .whereIn('provider', clientSecretProviders)
        .whereRaw("NOT (missing_fields @> '{oauth_client_secret}')")
        .where('oauth_client_secret', null)
        .update({ missing_fields: knex.raw("array_append(missing_fields, 'oauth_client_secret')") });

    const needsAppLink = ['APP'];
    const appLinkProviders = Object.entries(providers)
        .filter(([, config]) => needsAppLink.includes(config.auth_mode))
        .map(([name]) => name);
    await knex
        .queryBuilder()
        .from('_nango_configs')
        .whereIn('provider', appLinkProviders)
        .whereRaw("NOT (missing_fields @> '{app_link}')")
        .where('app_link', null)
        .update({ missing_fields: knex.raw("array_append(missing_fields, 'app_link')") });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {
    // do nothing
};
