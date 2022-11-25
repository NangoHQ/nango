#!/usr/bin/env node

/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import { Command } from 'commander';
import axios from 'axios';
import path from 'path';

const program = new Command();

let hostport = process.env['PIZZLY_HOSTPORT'] || 'http://localhost:3004';

program
    .name('pizzly')
    .description(
        "A CLI tool to configure Pizzly.\n\n IMPORTANT: You need to set the PIZZLY_HOSTPORT environment variable if Pizzly Server doesn't run on http://localhost:3004."
    );

program
    .command('config:list')
    .description('List all Integration configurations.')
    .action(async () => {
        let url = path.join(hostport, '/config');
        await axios
            .get(url)
            .then((res) => {
                console.log('\n\nHere is the list of configured Integrations:\n\n');
                console.log(res.data);
            })
            .catch((err) => {
                console.log(`❌ Error: ${err.response?.data?.error || err}`);
            });
    });

program
    .command('config:get')
    .description('Get an Integration configuration.')
    .argument('<integration_key>', 'The unique key of the Integration.')
    .action(async (integration_key) => {
        let url = path.join(hostport, `/config/${integration_key}`);
        await axios
            .get(url)
            .then((res) => {
                console.log('\n\nHere is the requested Integration configuration:\n\n');
                console.log(res.data);
            })
            .catch((err) => {
                console.log(`❌ Error: ${err.response?.data?.error || err}`);
            });
    });

program
    .command('config:create')
    .description('Create an Integration configuration.')
    .argument('<integration_key>', 'The unique key of the Integration.')
    .argument('<integration_type>', 'The type of the Integration (e.g. hubspot).')
    .argument('<oauth_client_id>', 'The OAuth Client ID obtained with the API provider.')
    .argument('<oauth_client_secret>', 'The OAuth Client Secret obtained with the API provider.')
    .argument('<oauth_scopes>', 'The OAuth Scopes obtained with the API provider (comma-separated).')
    .action(async (integration_key, integration_type, oauth_client_id, oauth_client_secret, oauth_scopes) => {
        let body = {
            unique_key: integration_key,
            type: integration_type,
            oauth_client_id: oauth_client_id,
            oauth_client_secret: oauth_client_secret,
            oauth_scopes: oauth_scopes
        };

        let url = path.join(hostport, `/config`);
        await axios
            .post(url, body)
            .then((_) => {
                console.log('\n\n✅ Successfully created new configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ Error: ${err.response?.data?.error || err}`);
            });
    });

program
    .command('config:edit')
    .description('Edit an Integration configuration.')
    .argument('<integration_key>', 'The unique key of the Integration.')
    .argument('<integration_type>', 'The type of the Integration (e.g. hubspot).')
    .argument('<oauth_client_id>', 'The OAuth Client ID obtained with the API provider.')
    .argument('<oauth_client_secret>', 'The OAuth Client Secret obtained with the API provider.')
    .argument('<oauth_scopes>', 'The OAuth Scopes obtained with the API provider (comma-separated).')
    .action(async (integration_key, integration_type, oauth_client_id, oauth_client_secret, oauth_scopes) => {
        let body = {
            unique_key: integration_key,
            type: integration_type,
            oauth_client_id: oauth_client_id,
            oauth_client_secret: oauth_client_secret,
            oauth_scopes: oauth_scopes
        };

        let url = path.join(hostport, `/config`);
        await axios
            .put(url, body)
            .then((_) => {
                console.log('\n\n✅ Successfully edited existing configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ Error: ${err.response?.data?.error || err}`);
            });
    });

program
    .command('config:delete')
    .description('Delete an Integration configuration.')
    .argument('<integration_key>', 'The unique key of the Integration.')
    .action(async (integration_key) => {
        let url = path.join(hostport, `/config/${integration_key}`);
        await axios
            .delete(url)
            .then((_) => {
                console.log('\n\n✅ Successfully deleted configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ Error: ${err.response?.data?.error || err}`);
            });
    });

program
    .command('auth')
    .description('Get authorization credentials.')
    .argument('<connection_id>', 'The ID of the Connection.')
    .argument('<integration_key>', 'The unique key of the Integration.')
    .action(async (connection_id, integration_key) => {
        let url = path.join(hostport, `/connection/${connection_id}`);
        await axios
            .get(url, { params: { integration_key: integration_key } })
            .then((res) => {
                console.log('\n\nHere is the requested connection with credentials:\n\n');
                console.log(res.data.credentials);
            })
            .catch((err) => {
                console.log(`❌ Error: ${err.response?.data?.error || err}`);
            });
    });

program.parseAsync(process.argv);
