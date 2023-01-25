#!/usr/bin/env node

/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import { Command } from 'commander';
import axios from 'axios';
import path from 'path';
import https from 'https';

const program = new Command();

let hostport = process.env['PIZZLY_HOSTPORT'] || 'http://localhost:3003';

// Test from the package root (/packages/cli) with 'node dist/index.js'
program
    .name('pizzly')
    .description(
        "A CLI tool to configure Pizzly.\n\n IMPORTANT: You need to set the PIZZLY_HOSTPORT environment variable if Pizzly Server doesn't run on http://localhost:3003."
    );

program
    .command('config:list')
    .description('List all provider configurations.')
    .action(async () => {
        let url = path.join(hostport, '/config');
        await axios
            .get(url, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((res) => {
                console.log('\n\nHere is the list of provider configurations:\n\n');
                console.log(res.data);
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data?.error || err}`);
            });
    });

program
    .command('config:get')
    .description('Get an provider configuration.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .action(async (provider_config_key) => {
        let url = path.join(hostport, `/config/${provider_config_key}`);
        await axios
            .get(url, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((res) => {
                console.log('\n\nHere is the requested provider configuration:\n\n');
                console.log(res.data);
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data?.error || err}`);
            });
    });

program
    .command('config:create')
    .description('Create an provider configuration.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (choose a friendly name, e.g. hubspot_staging).')
    .argument('<provider>', 'The provider of the 3rd-party API, must match the template keys in https://nango.dev/oauth-providers (e.g. hubspot).')
    .argument('<oauth_client_id>', 'The OAuth Client ID obtained from the API provider.')
    .argument('<oauth_client_secret>', 'The OAuth Client Secret obtained from the API provider.')
    .argument('<oauth_scopes>', 'The OAuth Scopes obtained from the API provider (comma-separated).')
    .action(async (provider_config_key, provider, oauth_client_id, oauth_client_secret, oauth_scopes) => {
        let body = {
            provider_config_key: provider_config_key,
            provider: provider,
            oauth_client_id: oauth_client_id,
            oauth_client_secret: oauth_client_secret,
            oauth_scopes: oauth_scopes
        };

        let url = path.join(hostport, `/config`);
        await axios
            .post(url, body, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((_) => {
                console.log('\n\n✅ Successfully created a new provider configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data?.error || err}`);
            });
    });

program
    .command('config:edit')
    .description('Edit an provider configuration.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (choose a friendly name, e.g. hubspot_staging).')
    .argument('<provider>', 'The provider of the 3rd-party API, must match the template keys in https://nango.dev/oauth-providers (e.g. hubspot).')
    .argument('<oauth_client_id>', 'The OAuth Client ID obtained from the API provider.')
    .argument('<oauth_client_secret>', 'The OAuth Client Secret obtained from the API provider.')
    .argument('<oauth_scopes>', 'The OAuth Scopes obtained from the API provider (comma-separated).')
    .action(async (provider_config_key, provider, oauth_client_id, oauth_client_secret, oauth_scopes) => {
        let body = {
            provider_config_key: provider_config_key,
            provider: provider,
            oauth_client_id: oauth_client_id,
            oauth_client_secret: oauth_client_secret,
            oauth_scopes: oauth_scopes
        };

        let url = path.join(hostport, `/config`);
        await axios
            .put(url, body, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((_) => {
                console.log('\n\n✅ Successfully edited an existing provider configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data?.error || err}`);
            });
    });

program
    .command('config:delete')
    .description('Delete an provider configuration.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .action(async (provider_config_key) => {
        let url = path.join(hostport, `/config/${provider_config_key}`);
        await axios
            .delete(url, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((_) => {
                console.log('\n\n✅ Successfully deleted a provider configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data?.error || err}`);
            });
    });

program
    .command('connection:get')
    .description('Get a connection with credentials.')
    .argument('<connection_id>', 'The ID of the Connection.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .action(async (connection_id, provider_config_key) => {
        let url = path.join(hostport, `/connection/${connection_id}`);
        await axios
            .get(url, { params: { provider_config_key: provider_config_key }, headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((res) => {
                console.log('\n\nHere is the requested connection with credentials:\n\n');
                console.log(res.data);
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data?.error || err}`);
            });
    });

program.parseAsync(process.argv);

function enrichHeaders(headers: Record<string, string | number | boolean> = {}) {
    if (process.env['PIZZLY_SECRET_KEY'] != null) {
        headers['Authorization'] = 'Basic ' + Buffer.from(process.env['PIZZLY_SECRET_KEY'] + ':').toString('base64');
    }

    return headers;
}

function httpsAgent() {
    return new https.Agent({
        rejectUnauthorized: false
    });
}
