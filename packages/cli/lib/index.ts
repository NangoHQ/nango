#!/usr/bin/env node

/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import { Command } from 'commander';
import axios from 'axios';
import https from 'https';

const program = new Command();

let localhost = 'http://localhost:3003';
var hostport = process.env['NANGO_HOSTPORT'] || 'https://api.nango.dev';

if (hostport.slice(-1) === '/') {
    hostport = hostport.slice(0, -1);
}

// Test from the package root (/packages/cli) with 'node dist/index.js'
program
    .name('nango')
    .description(
        `A CLI tool to configure Nango:\n- Cloud: Set the NANGO_SECRET env variable\n- Local: use the '-l' option for each command\n- Self-Hosting: set the NANGO_HOSTPORT env variable`
    );

program
    .command('config:list')
    .description('List all provider configurations.')
    .option('-l, --local', 'Necessary when Nango runs on localhost.')
    .action(async function (this: Command) {
        let isLocal = this.opts()['local'];
        checkEnvVars(isLocal);
        let url = getHost(isLocal) + '/config';
        await axios
            .get(url, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((res) => {
                console.log(res.data);
                console.table(
                    res.data['configs'].map((o: any) => {
                        return { unique_key: o.unique_key, provider: o.provider, created: o.created_at };
                    })
                );
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || err}`);
            });
    });

program
    .command('config:get')
    .description('Get an provider configuration.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .option('-l, --local', 'Necessary when Nango runs on localhost.')
    .action(async function (this: Command) {
        let isLocal = this.opts()['local'];
        checkEnvVars(isLocal);
        let url = getHost(isLocal) + `/config/${this.args[0]}`;
        await axios
            .get(url, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((res) => {
                console.table(res.data['config']);
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || err}`);
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
    .option('-l, --local', 'Necessary when Nango runs on localhost.')
    .action(async function (this: Command) {
        let isLocal = this.opts()['local'];
        checkEnvVars(isLocal);
        let body = {
            provider_config_key: this.args[0],
            provider: this.args[1],
            oauth_client_id: this.args[2],
            oauth_client_secret: this.args[3],
            oauth_scopes: this.args[4]
        };

        let url = getHost(isLocal) + `/config`;
        await axios
            .post(url, body, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((_) => {
                console.log('\n\n✅ Successfully created a new provider configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || err}`);
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
    .option('-l, --local', 'Necessary when Nango runs on localhost.')
    .action(async function (this: Command) {
        let isLocal = this.opts()['local'];
        checkEnvVars(isLocal);
        let body = {
            provider_config_key: this.args[0],
            provider: this.args[1],
            oauth_client_id: this.args[2],
            oauth_client_secret: this.args[3],
            oauth_scopes: this.args[4]
        };

        let url = getHost(isLocal) + `/config`;
        await axios
            .put(url, body, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((_) => {
                console.log('\n\n✅ Successfully edited an existing provider configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || err}`);
            });
    });

program
    .command('config:delete')
    .description('Delete an provider configuration.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .option('-l, --local', 'Necessary when Nango runs on localhost.')
    .action(async function (this: Command) {
        let isLocal = this.opts()['local'];
        checkEnvVars(isLocal);
        let url = getHost(isLocal) + `/config/${this.args[0]}`;
        await axios
            .delete(url, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((_) => {
                console.log('\n\n✅ Successfully deleted a provider configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || err}`);
            });
    });

program
    .command('connection:get')
    .description('Get a connection with credentials.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .argument('<connection_id>', 'The ID of the Connection.')
    .option('-l, --local', 'Necessary when Nango runs on localhost.')
    .action(async function (this: Command) {
        let isLocal = this.opts()['local'];
        checkEnvVars(isLocal);
        let url = getHost(isLocal) + `/connection/${this.args[1]}`;
        await axios
            .get(url, { params: { provider_config_key: this.args[0] }, headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((res) => {
                console.log(res.data);
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || err}`);
            });
    });

program
    .command('token:get')
    .description('Get an access token.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .argument('<connection_id>', 'The ID of the Connection.')
    .option('-l, --local', 'Necessary when Nango runs on localhost.')
    .action(async function (this: Command) {
        let isLocal = this.opts()['local'];
        checkEnvVars(isLocal);
        let url = getHost(isLocal) + `/connection/${this.args[1]}`;
        await axios
            .get(url, { params: { provider_config_key: this.args[0] }, headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((response) => {
                switch (response.data.credentials.type) {
                    case 'OAUTH2':
                        console.table({ token: response.data.credentials.access_token });
                        break;
                    case 'OAUTH1':
                        console.table(`token:${response.data.credentials.oauth_token}\nsecret:${response.data.credentials.oauth_token_secret}`);
                        break;
                    default:
                        throw Error(`Unrecognized OAuth type '${response.data.credentials.type}' in stored credentials.`);
                }
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || err.message}`);
            });
    });

program
    .command('connection:list')
    .description('List connections without credentials.')
    .option('-l, --local', 'Necessary when Nango runs on localhost.')
    .action(async function (this: Command) {
        let isLocal = this.opts()['local'];
        checkEnvVars(isLocal);
        let url = getHost(isLocal) + `/connection`;
        await axios
            .get(url, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((res) => {
                console.table(res.data['connections']);
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || err}`);
            });
    });

program.parseAsync(process.argv);

function getHost(isLocal: boolean) {
    return isLocal ? localhost : hostport;
}

function enrichHeaders(headers: Record<string, string | number | boolean> = {}) {
    if (process.env['NANGO_SECRET']) {
        // For Nango Cloud (unified)
        headers['Authorization'] = 'Bearer ' + process.env['NANGO_SECRET'];
    } else if (process.env['NANGO_SECRET_KEY']) {
        // For Nango OSS
        headers['Authorization'] = 'Basic ' + Buffer.from(process.env['NANGO_SECRET_KEY'] + ':').toString('base64');
    }

    headers['Accept-Encoding'] = 'application/json';

    return headers;
}

function httpsAgent() {
    return new https.Agent({
        rejectUnauthorized: false
    });
}

function checkEnvVars(isLocal: boolean) {
    if (isLocal) {
        console.log(`\n\nAssuming Nango runs on localhost:3003. That's not right?\n- Remove the '-l' option if using Nango Cloud of self-hosting Nango.\n\n`);
    } else if (process.env['NANGO_HOSTPORT']) {
        console.log(
            `\n\nAssuming that you are self-hosting Nango on ${process.env['NANGO_HOSTPORT']}. That's not right?\n- Add the '-l' option if running Nango on localhost\n- Or unset the NANGO_HOSTPORT env variable if using Nango Cloud\n\n`
        );
    } else if (process.env['NANGO_SECRET']) {
        console.log(
            `\n\nAssuming that you are using Nango Cloud. That's not right?\n- Add the '-l' option if running Nango on localhost\n- Or set the NANGO_HOSTPORT env variable if self-hosting Nango\n\n`
        );
    } else {
        console.log(
            `\n\nAssuming that you are using Nango Cloud but your are missing the 'NANGO_SECRET' env variable:\n- Add the NANGO_SECRET env variable if using Nango Cloud\n- Or add the '-l' option if running Nango on localhost\n- Or set the 'NANGO_HOSTPORT' env variable if self-hosting Nango\n\n`
        );
    }
}
