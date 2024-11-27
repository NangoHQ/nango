/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('node:path');
const fs = require('node:fs');
const yaml = require('js-yaml');

exports.up = async function (knex) {
    let providers;
    const providersPath = path.join(__dirname, '..', '..', '..', 'shared', 'providers.yaml');
    try {
        providers = yaml.load(fs.readFileSync(providersPath, 'utf8'));
    } catch (e) {
        console.error(
            `Warning: Failed to load providers.yaml. Skipping migration. Missing fields on existing integrations will not show warnings in the dashboard until they are saved again. Underlying error: ${e.message}. `
        );
        return;
    }

    const needsClientId = ['OAUTH1', 'OAUTH2', 'TBA', 'APP'];
    const clientIdProviders = Object.entries(providers)
        .filter(([_, config]) => needsClientId.includes(config.auth_mode))
        .map(([name]) => name);
    await knex
        .queryBuilder()
        .from('_nango_configs')
        .whereIn('provider', clientIdProviders)
        .whereRaw("NOT (missing_fields @> '{oauth_client_id}')")
        .update({ missing_fields: knex.raw("array_append(missing_fields, 'oauth_client_id')") });

    const needsClientSecret = ['OAUTH1', 'OAUTH2', 'TBA', 'APP'];
    const clientSecretProviders = Object.entries(providers)
        .filter(([_, config]) => needsClientSecret.includes(config.auth_mode))
        .map(([name]) => name);
    await knex
        .queryBuilder()
        .from('_nango_configs')
        .whereIn('provider', clientSecretProviders)
        .whereRaw("NOT (missing_fields @> '{oauth_client_secret}')")
        .update({ missing_fields: knex.raw("array_append(missing_fields, 'oauth_client_secret')") });

    const needsAppLink = ['APP'];
    const appLinkProviders = Object.entries(providers)
        .filter(([_, config]) => needsAppLink.includes(config.auth_mode))
        .map(([name]) => name);
    await knex
        .queryBuilder()
        .from('_nango_configs')
        .whereIn('provider', appLinkProviders)
        .whereRaw("NOT (missing_fields @> '{app_link}')")
        .update({ missing_fields: knex.raw("array_append(missing_fields, 'app_link')") });
};

exports.down = function () {
    // do nothing
};
