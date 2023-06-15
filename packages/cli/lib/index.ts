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
import * as dotenv from 'dotenv';
import promptly from 'promptly';

import type { NangoConfig, NangoIntegration, NangoIntegrationData } from '@nangohq/shared';
import { nangoConfigFile, loadSimplifiedConfig, checkForIntegrationFile } from '@nangohq/shared';
import { init, run, tsc, tscWatch, configWatch, dockerRun } from './sync.js';
import { hostport, checkEnvVars, enrichHeaders, httpsAgent, NANGO_INTEGRATIONS_LOCATION, buildInterfaces, setCloudHost, setStagingHost } from './utils.js';

interface GlobalOptions {
    secretKey?: string;
    host?: string;
}

class NangoCommand extends Command {
    override createCommand(name: string) {
        const cmd = new Command(name);
        cmd.option('-sk, --secret-key [secretKey]', 'Set the secret key. Overrides the `NANGO_SECRET_KEY` value set in the .env file');
        cmd.option('-h, --host [host]', 'Set the host. Overrides the `NANGO_HOSTPORT` value set in the .env file');

        return cmd;
    }
}

const program = new NangoCommand();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Test from the package root (/packages/cli) with 'node dist/index.js'
program
    .name('nango')
    .description(
        `A CLI tool to configure Nango:\n- By defaults, the CLI assumes that you are running Nango on localhost:3003\n- For Nango Cloud: Set the NANGO_HOSTPORT & NANGO_SECRET_KEY env variables\n- For Self-Hosting: set the NANGO_HOSTPORT env variable`
    );

program.addHelpText('before', chalk.green(figlet.textSync('Nango CLI')));

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
        const configContents = fs.readFileSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`), 'utf8');
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
                    })
                });

                if (!fs.existsSync(`${NANGO_INTEGRATIONS_LOCATION}/${syncName}.ts`)) {
                    fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/${syncName}.ts`, rendered);
                }
            }
        }

        console.log(chalk.green(`Integration files have been created`));
    });

program
    .command('tsc')
    .alias('compile')
    .description('Compile the integration files to JavaScript')
    .action(() => {
        tsc();
    });

program
    .command('tsc:watch')
    .alias('compile:watch')
    .alias('tscw')
    .description('Watch tsc files while developing. Set --no-compile-interfaces to disable watching the config file')
    .option('--no-compile-interfaces', `Watch the ${nangoConfigFile} and recompile the interfaces on change`, true)
    .action(async function (this: Command) {
        const { compileInterfaces } = this.opts();

        if (compileInterfaces) {
            configWatch();
        }

        tscWatch();
    });

program
    .command('docker:run')
    .alias('dr')
    .description('Run the docker container locally')
    .action(() => {
        dockerRun();
    });

program
    .command('dev')
    .alias('develop')
    .alias('watch')
    .description('Work locally to add integration code')
    .action(() => {
        configWatch();
        tscWatch();
        dockerRun();
    });

interface DeployOptions extends GlobalOptions {
    staging: boolean;
    version?: string;
    sync?: string;
}

program
    .command('deploy')
    .alias('d')
    .description('Deploy a Nango integration')
    .option('--staging', 'Deploy to the staging instance')
    .option('-v, --version [version]', 'Optional: Set a version of this deployment to tag this integration with. Can be used for rollbacks.')
    .option('-s, --sync [syncName]', 'Optional deploy only this sync name.')
    .action(async function (this: Command) {
        const options = this.opts();
        (async (options: DeployOptions) => {
            const { staging, version, sync: optionalSyncName, secretKey, host } = options;

            if (host) {
                process.env['NANGO_HOSTPORT'] = host;
            }

            if (secretKey) {
                process.env['NANGO_SECRET_KEY'] = secretKey;
            }

            if (!process.env['NANGO_HOSTPORT']) {
                if (staging) {
                    setStagingHost();
                } else {
                    setCloudHost();
                }
            }

            if (hostport !== 'http://localhost:3003' && !process.env['NANGO_SECRET_KEY']) {
                console.log(chalk.red(`NANGO_SECRET_KEY environment variable is not set. Please set it now`));
                try {
                    const secretKey = await promptly.prompt('Secret Key: ');
                    if (secretKey) {
                        process.env['NANGO_SECRET_KEY'] = secretKey;
                    } else {
                        return;
                    }
                } catch (error) {
                    console.log('Error occurred while trying to prompt for secret key:', error);
                    return;
                }
            }

            checkEnvVars();
            tsc();

            const cwd = process.cwd();
            const config = await loadSimplifiedConfig(path.resolve(cwd, NANGO_INTEGRATIONS_LOCATION));

            if (!config) {
                throw new Error(`Error loading the ${nangoConfigFile} file`);
            }

            const postData = [];

            for (const integration of config) {
                const { providerConfigKey } = integration;
                let { syncs } = integration;

                if (optionalSyncName) {
                    syncs = syncs.filter((sync) => sync.name === optionalSyncName);
                }

                for (const sync of syncs) {
                    const { name: syncName, runs, returns: models, models: model_schema } = sync;

                    const { path: integrationFilePath, result: integrationFileResult } = checkForIntegrationFile(
                        syncName,
                        path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}`)
                    );

                    if (!integrationFileResult) {
                        console.log(chalk.red(`No integration file found for ${syncName} at ${integrationFilePath}. Skipping...`));
                        continue;
                    }

                    const body = {
                        syncName,
                        providerConfigKey,
                        models,
                        version,
                        runs,
                        fileBody: fs.readFileSync(integrationFilePath, 'utf8'),
                        model_schema: JSON.stringify(model_schema)
                    };

                    postData.push(body);
                }
            }

            const url = hostport + `/sync/deploy`;

            await axios
                .post(url, postData, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
                .then((_) => {
                    console.log(chalk.green(`Successfully deployed the syncs!`));
                })
                .catch((err) => {
                    const errorMessage = JSON.stringify(err.response.data, null, 2);
                    console.log(chalk.red(`Error deploying the syncs with the following error: ${errorMessage}}`));
                });
        })(options as DeployOptions);
    });

program
    .command('sync:config.check')
    .alias('scc')
    .description('Verify the parsed sync config and output the object for verification')
    .action(async () => {
        const cwd = process.cwd();
        const config = await loadSimplifiedConfig(path.resolve(cwd, NANGO_INTEGRATIONS_LOCATION));

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
    .option('-u, --useServerLastSyncDate', 'Optional boolean: use the server stored last sync date to retrieve records greater than this date')
    .action(async function (this: Command) {
        checkEnvVars();
        run(this.args, this.opts());
    });

program.parse();
