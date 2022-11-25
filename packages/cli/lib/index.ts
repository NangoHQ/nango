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
    .description('A CLI tool to configure Pizzly\n IMPORTANT: You need to set the PIZZLY_HOSTPORT environment variables for the CLI to work.');

program
    .command('list')
    .description('List all Integration configurations.')
    .action(async () => {
        let url = path.join(hostport, '/config');
        return await axios.get(url);
    });

program
    .command('config:get')
    .description('Get an Integration configuration.')
    .argument('<integration_key>', 'The unique key of the Integration.')
    .action(async (integration_key) => {
        let url = path.join(hostport, `/config/${integration_key}`);
        return await axios.get(url);
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
        return await axios.post(url, { data: body });
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
        return await axios.put(url, { data: body });
    });

program
    .command('config:delete')
    .description('Delete an Integration configuration.')
    .argument('<integration_key>', 'The unique key of the Integration.')
    .action(async (integration_key) => {
        let url = path.join(hostport, `/config/${integration_key}`);
        return await axios.delete(url);
    });

program
    .command('connection:get')
    .description('Get a Connection with associated credentials.')
    .argument('<connection_id>', 'The ID of the Connection.')
    .argument('<integration_key>', 'The unique key of the Integration.')
    .action(async (connection_id, integration_key) => {
        let url = path.join(hostport, `/connection/${connection_id}`);
        return await axios.get(url, { params: { integration_key: integration_key } });
    });

program.parseAsync(process.argv);
