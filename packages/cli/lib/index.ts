#!/usr/bin/env node

/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import { Command } from 'commander';
import axios from 'axios';
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
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';

import type { NangoConfig, NangoModel, NangoIntegration, NangoIntegrationData } from '@nangohq/shared';
import { loadSimplifiedConfig } from '@nangohq/shared';
import { init, run, tscWatch, configWatch } from './sync.js';
import { checkEnvVars, enrichHeaders, httpsAgent, getConnection, getFieldType, configFile, NANGO_INTEGRATIONS_LOCATION, buildInterfaces } from './utils.js';

const program = new Command();

let hostport = process.env['NANGO_HOSTPORT'] || 'http://localhost:3003';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (hostport.slice(-1) === '/') {
    hostport = hostport.slice(0, -1);
}

dotenv.config();

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
        const [providerConfigKey, connectionId] = this.args;

        if (!providerConfigKey) {
            console.log(chalk.red('Please provide a provider config key.'));
        }

        if (!connectionId) {
            console.log(chalk.red('Please provide a connection ID.'));
        }

        const connection = await getConnection(providerConfigKey as string, connectionId as string);

        console.log(connection);
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
        init();
    });

program
    .command('generate')
    .alias('g')
    .description('Generate a new Nango integration')
    .action(() => {
        const templateContents = fs.readFileSync(path.resolve(__dirname, './integration.ejs'), 'utf8');

        const cwd = process.cwd();
        const configContents = fs.readFileSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/${configFile}`), 'utf8');
        const configData: NangoConfig = yaml.load(configContents) as unknown as NangoConfig;
        const { integrations } = configData;
        const { models } = configData;

        const interfaceDefinitions = buildInterfaces(models);

        fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/models.ts`, interfaceDefinitions.join('\n'));

        for (let i = 0; i < Object.keys(integrations).length; i++) {
            const providerConfigKey = Object.keys(integrations)[i] as string;
            const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };
            const syncNames = Object.keys(syncObject);
            for (let k = 0; k < syncNames.length; k++) {
                const syncName = syncNames[k] as string;
                const syncData = syncObject[syncName] as unknown as NangoIntegrationData;
                const { returns: models } = syncData;
                const syncNameCamel = syncName
                    .split('-')
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join('');
                const rendered = ejs.render(templateContents, {
                    syncName: syncNameCamel,
                    interfaceNames: models.map((model) => {
                        const singularModel = model?.charAt(model.length - 1) === 's' ? model.slice(0, -1) : model;
                        return `${singularModel.charAt(0).toUpperCase()}${singularModel.slice(1)}`;
                    }),
                    mappings: models.map((model) => {
                        const singularModel = model.charAt(model.length - 1) === 's' ? model.slice(0, -1) : model;
                        return {
                            name: model,
                            type: `${singularModel.charAt(0).toUpperCase()}${singularModel.slice(1)}`
                        };
                    }),
                    providerConfigKey
                });
                fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/_${syncName}.ts`, rendered);
            }
        }

        console.log(chalk.green(`Integration files have been created`));
    });

program
    .command('tsc')
    .description('Work locally to add integration code')
    .action(() => {
        const cwd = process.cwd();
        const integrationFiles = glob.sync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/*.ts`));
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

            const fileNameWithExt = path.basename(file);
            const integrationName = path.parse(fileNameWithExt).name;
            const jsFileContent = result.outputText;

            const distDir = path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist`);

            if (!fs.existsSync(distDir)) {
                fs.mkdirSync(distDir);
            }

            fs.writeFileSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist/${integrationName}.js`), jsFileContent);
        }
    });

program
    .command('tsc:watch')
    .description('Watch tsc files while developing. Set --no-compile-interfaces to disable watching the config file')
    .option('--no-compile-interfaces', `Watch the ${configFile} and recompile the interfaces on change`, true)
    .action(async function (this: Command) {
        const { compileInterfaces } = this.opts();

        tscWatch();
        if (compileInterfaces) {
            configWatch();
        }
    });

program
    .command('dev')
    .alias('develop')
    .alias('watch')
    .description('Work locally to add integration code')
    .action(() => {
        const cwd = process.cwd();
        tscWatch();
        configWatch();

        // look into
        // https://www.npmjs.com/package/docker-compose
        spawn('docker', ['compose', '-f', 'node_modules/nango/docker/docker-compose.yaml', '--project-directory', '.', 'up', '--build'], {
            cwd,
            detached: false,
            stdio: 'inherit'
        });
    });

program
    .command('deploy')
    .alias('d')
    .description('Deploy a Nango integration')
    .action(async () => {
        const cwd = process.cwd();
        const integrationFiles = glob.sync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/*.ts`));
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
            fs.writeFileSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/${integrationName}.js`), jsFileContent);

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

program
    .command('sync:config.check')
    .alias('scc')
    .description('Verify the parsed sync config and output the object for verification')
    .action(async () => {
        const cwd = process.cwd();
        const config = loadSimplifiedConfig(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/${configFile}`));

        console.log(chalk.green(JSON.stringify(config, null, 2)));
    });

program
    .command('sync:run')
    .alias('sr')
    .description('Run the sync process to help with debugging')
    .option('-s, --sync <syncName>', 'The name of the sync (e.g. account-sync).')
    .option('-p, --provider <provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .option('-c, --connection <connection_id>', 'The ID of the Connection.')
    .option('-l, --lastSyncDate [lastSyncDate]', 'Optional: last sync date to retrieve records greater than this date')
    .action(async function (this: Command) {
        checkEnvVars();
        run(this.args, this.opts());
    });

program.parse();
