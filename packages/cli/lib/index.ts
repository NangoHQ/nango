#!/usr/bin/env node

/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import { Command } from 'commander';
import axios from 'axios';
import https from 'https';
import chalk from 'chalk';
import figlet from 'figlet';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import ejs from 'ejs';
import glob from 'glob';
import byots from 'byots';
import { build } from 'esbuild';
import webpack from 'webpack';
import { fs as memfs } from 'memfs';
import { exec } from 'child_process';

const program = new Command();

let hostport = process.env['NANGO_HOSTPORT'] || 'http://localhost:3003';
const cloudHost = 'https://api.nango.dev';
const stagingHost = 'https://nango-cloud-staging.onrender.com';
const dir = 'nango-integrations';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (hostport.slice(-1) === '/') {
    hostport = hostport.slice(0, -1);
}

// Test from the package root (/packages/cli) with 'node dist/index.js'
program
    .name('nango')
    .description(
        `A CLI tool to configure Nango:\n- By defaults, the CLI assumes that you are running Nango on localhost:3003\n- For Nango Cloud: Set the NANGO_HOSTPORT & NANGO_SECRET_KEY env variables\n- For Self-Hosting: set the NANGO_HOSTPORT env variable`
    );

program.addHelpText('before', chalk.green(figlet.textSync('Nango CLI')));

program
    .command('config:list')
    .description('List all provider configurations.')
    .action(async function (this: Command) {
        checkEnvVars();
        const url = hostport + '/config';
        await axios
            .get(url, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((res) => {
                console.table(
                    res.data['configs'].map((o: any) => {
                        return { unique_key: o.unique_key, provider: o.provider, created: o.created_at };
                    })
                );
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
            });
    });

program
    .command('config:get')
    .description('Get an provider configuration.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .action(async function (this: Command) {
        checkEnvVars();
        const url = hostport + `/config/${this.args[0]}`;
        await axios
            .get(url, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((res) => {
                console.table(res.data['config']);
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
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
    .action(async function (this: Command) {
        checkEnvVars();
        const body = {
            provider_config_key: this.args[0],
            provider: this.args[1],
            oauth_client_id: this.args[2],
            oauth_client_secret: this.args[3],
            oauth_scopes: this.args[4]
        };

        const url = hostport + `/config`;
        await axios
            .post(url, body, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((_) => {
                console.log('\n\n✅ Successfully created a new provider configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
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
    .action(async function (this: Command) {
        checkEnvVars();
        const body = {
            provider_config_key: this.args[0],
            provider: this.args[1],
            oauth_client_id: this.args[2],
            oauth_client_secret: this.args[3],
            oauth_scopes: this.args[4]
        };

        const url = hostport + `/config`;
        await axios
            .put(url, body, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((_) => {
                console.log('\n\n✅ Successfully edited an existing provider configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
            });
    });

program
    .command('config:delete')
    .description('Delete an provider configuration.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .action(async function (this: Command) {
        checkEnvVars();
        const url = hostport + `/config/${this.args[0]}`;
        await axios
            .delete(url, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((_) => {
                console.log('\n\n✅ Successfully deleted the provider configuration!\n\n');
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
            });
    });

program
    .command('connection:get')
    .description('Get a connection with credentials.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .argument('<connection_id>', 'The ID of the Connection.')
    .action(async function (this: Command) {
        checkEnvVars();
        const url = hostport + `/connection/${this.args[1]}`;
        await axios
            .get(url, { params: { provider_config_key: this.args[0] }, headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((res) => {
                console.log(res.data);
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
            });
    });

program
    .command('token:get')
    .description('Get an access token.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .argument('<connection_id>', 'The ID of the Connection.')
    .action(async function (this: Command) {
        checkEnvVars();
        const url = hostport + `/connection/${this.args[1]}`;
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
                        throw new Error(`Unrecognized OAuth type '${response.data.credentials.type}' in stored credentials.`);
                }
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
            });
    });

program
    .command('connection:list')
    .description('List connections without credentials.')
    .action(async function (this: Command) {
        checkEnvVars();
        const url = hostport + `/connection`;
        await axios
            .get(url, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((res) => {
                console.table(res.data['connections']);
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
            });
    });

program
    .command('connection:delete')
    .description('Delete a connection.')
    .argument('<provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .argument('<connection_id>', 'The ID of the Connection.')
    .action(async function (this: Command) {
        checkEnvVars();
        const url = hostport + `/connection/${this.args[1]}`;
        await axios
            .delete(url, { params: { provider_config_key: this.args[0] }, headers: enrichHeaders(), httpsAgent: httpsAgent() })
            .then((_) => {
                console.log('\n\n✅ Successfully deleted the connection!\n\n');
            })
            .catch((err) => {
                console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
            });
    });

program
    .command('init')
    .alias('i')
    .description('Initialize a new Nango project')
    .action(() => {
        const data = {
            integrations: [
                {
                    'github-tickets': {
                        provider: 'github',
                        runs: 'every hour',
                        returns: ['ticket']
                    }
                }
            ],
            models: [
                {
                    ticket: {
                        id: 'integer',
                        title: 'char',
                        description: 'char',
                        status: 'char',
                        author: {
                            avatar_url: 'char'
                        }
                    }
                }
            ]
        };
        const yamlData = yaml.dump(data);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        fs.writeFileSync(`${dir}/config.yaml`, yamlData);

        console.log('config.yaml file has been created');
    });

program
    .command('generate')
    .alias('g')
    .description('Generate a new Nango integration')
    .action(() => {
        const templateContents = fs.readFileSync(path.resolve(__dirname, './integration.ejs'), 'utf8');

        const configContents = fs.readFileSync(path.resolve(__dirname, '../nango-integrations/config.yaml'), 'utf8');
        const configData = yaml.load(configContents) as any;
        const integrations = configData.integrations;
        const models = configData.models;

        for (const integrationWrapped of integrations) {
            const integrationName = Object.keys(integrationWrapped)[0] as string;
            const integration = integrationWrapped[integrationName];
            const { provider, returns } = integration;
            const providerUpper = provider.charAt(0).toUpperCase() + provider.slice(1);

            const [modelType] = integration.returns;
            const rendered = ejs.render(templateContents, { provider: providerUpper, modelType });

            fs.writeFileSync(`${dir}/${integrationName}.ts`, rendered);

            // create a migration file based on the model
            const migrationContents = fs.readFileSync(path.resolve(__dirname, './migration.ejs'), 'utf8');
            const tableName = `${integrationName}.v1.${Date.now()}`;
            const modelTypes = returns.map((modelName: string) => {
                return models.find((model: any) => Object.keys(model)[0] === modelName);
            });
            // TODO fix migration template
            //const renderedMigration = ejs.render(migrationContents, { tableName, data: modelTypes });
            console.log(migrationContents, tableName, modelTypes);
        }
    });

program
    .command('dev')
    .alias('develop')
    .description('Work locally to add integration code')
    .action(() => {
        // run docker compose and set the volume correctly
        //const command = 'docker-compose up -f ./node_modules/@nangohq/nango/packages/cli/docker-compose.yml';
        //const command = 'ls ./node_modules/@nangohq/nango/packages/cli/docker-compose.yml';
        const command = 'docker-compose -f node_modules/nango/docker/docker-compose.yaml up --build';

        // Execute the command as a child process
        exec(command, (error, stdout, stderr) => {
            console.log(stderr);
            if (error) {
                console.error(`Error executing command: ${error}`);
                return;
            }
            console.log(stdout);
        });
    });

program
    .command('deploy')
    .alias('d')
    .description('Deploy a Nango integration')
    .action(async () => {
        const cwd = process.cwd();
        const integrationFiles = glob.sync(path.resolve(cwd, './nango-integrations/*.ts'));
        for (const file of integrationFiles) {
            const tsFileContent = fs.readFileSync(file, 'utf-8');

            const compilerOptions = {
                target: byots.ScriptTarget.ES2022,
                module: byots.ModuleKind.ES2022
            };

            const result = byots.transpileModule(tsFileContent, {
                compilerOptions,
                fileName: file
            });

            const jsFileContent = result.outputText;

            // not needed
            const minifiedResult = await build({
                stdin: {
                    contents: jsFileContent,
                    resolveDir: __dirname,
                    sourcefile: file.replace(/\.ts$/, '.js'),
                    loader: 'js'
                },
                write: false,
                allowOverwrite: true,
                minify: true
            });

            const snippet = minifiedResult?.outputFiles[0]?.text as string;
            const fileNameWithExt = path.basename(file);
            const integrationName = path.parse(fileNameWithExt).name;

            // write the file to the integration folder
            fs.writeFileSync(path.resolve(cwd, `./nango-integrations/${integrationName}.js`), jsFileContent);

            const body = {
                integrationName,
                snippet,
                provider: 'github' // TODO, grab this from the yaml config
            };

            const url = hostport + `/sync-config`;

            await axios
                .post(url, body, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
                .then((_) => {
                    console.log('\n\n✅ Successfully created a new sync configuration!\n\n');
                })
                .catch((err) => {
                    console.log(`❌ ${err.response?.data.error || JSON.stringify(err)}`);
                });
        }
    });

program.parse();

function enrichHeaders(headers: Record<string, string | number | boolean> = {}) {
    if ((process.env['NANGO_HOSTPORT'] === cloudHost || process.env['NANGO_HOSTPORT'] === stagingHost) && process.env['NANGO_SECRET_KEY']) {
        // For Nango Cloud (unified)
        headers['Authorization'] = 'Bearer ' + process.env['NANGO_SECRET_KEY'];
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

function checkEnvVars() {
    if (hostport === 'http://localhost:3003') {
        console.log(`Assuming you are running Nango on localhost:3003 because you did not set the NANGO_HOSTPORT env var.\n\n`);
    } else if (hostport === cloudHost || hostport === stagingHost) {
        if (!process.env['NANGO_SECRET_KEY']) {
            console.log(`Assuming you are using Nango Cloud but your are lacking the NANGO_SECRET_KEY env var.`);
        } else if (hostport === cloudHost) {
            console.log(`Assuming you are using Nango Cloud (because you set the NANGO_HOSTPORT env var to https://api.nango.dev).`);
        } else if (hostport === stagingHost) {
            console.log(`Assuming you are using Nango Cloud (because you set the NANGO_HOSTPORT env var to https://api.staging.nango.dev).`);
        }
    } else {
        console.log(`Assuming you are self-hosting Nango (becauses you set the NANGO_HOSTPORT env var to ${hostport}).`);
    }
}
