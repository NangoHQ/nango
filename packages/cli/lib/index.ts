#!/usr/bin/env node

/*
 * Copyright (c) 2023 Nango, all rights reserved.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import path from 'path';
import * as dotenv from 'dotenv';

import { nangoConfigFile, loadSimplifiedConfig } from '@nangohq/shared';
import { init, run, generate, tsc, tscWatch, configWatch, dockerRun, version, deploy } from './sync.js';
import { upgradeAction, NANGO_INTEGRATIONS_LOCATION, verifyNecessaryFiles } from './utils.js';
import type { ENV, DeployOptions } from './types.js';

class NangoCommand extends Command {
    override createCommand(name: string) {
        const cmd = new Command(name);
        cmd.option('--secret-key [secretKey]', 'Set the secret key. Overrides the `NANGO_SECRET_KEY` value set in the .env file');
        cmd.option('--host [host]', 'Set the host. Overrides the `NANGO_HOSTPORT` value set in the .env file');
        cmd.hook('preAction', async () => {
            await upgradeAction();
        });

        return cmd;
    }
}

const program = new NangoCommand();

dotenv.config();

program.name('nango').description(
    `By default, the CLI assumes that you are using Nango Cloud so you need to set the NANGO_SECRET_KEY env variable or pass in the --secret-key flag with each command.
For Self-Hosting: set the NANGO_HOSTPORT env variable or pass in the --host flag with each command.`
);

program.addHelpText('before', chalk.green(figlet.textSync('Nango CLI')));

program
    .command('version')
    .alias('v')
    .description('Print the version of the Nango CLI, Nango Worker, and Nango Server.')
    .action(() => {
        version();
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
    .action(async () => {
        await verifyNecessaryFiles();
        generate();
    });

program
    .command('tsc')
    .alias('compile')
    .description('Compile the integration files to JavaScript')
    .action(async function (this: Command) {
        await verifyNecessaryFiles();
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
        await verifyNecessaryFiles();

        if (compileInterfaces) {
            configWatch();
        }

        tscWatch();
    });

program
    .command('start')
    .alias('dr')
    .alias('docker:run')
    .description('Run the docker container locally')
    .action(async () => {
        await verifyNecessaryFiles();
        await dockerRun();
    });

program
    .command('dev')
    .alias('develop')
    .alias('watch')
    .description('Work locally to add integration code')
    .option('--no-compile-interfaces', `Watch the ${nangoConfigFile} and recompile the interfaces on change`, true)
    .action(async function (this: Command) {
        const { compileInterfaces } = this.opts();
        await verifyNecessaryFiles();
        if (compileInterfaces) {
            configWatch();
        }

        tscWatch();
        await dockerRun();
    });

program
    .command('deploy')
    .alias('d')
    .alias('deploy:prod')
    .alias('deploy:cloud')
    .description('Deploy a Nango integration')
    .option('--staging', 'Deploy to the staging instance')
    .option('--local', 'Deploy to the local instance')
    .option('-v, --version [version]', 'Optional: Set a version of this deployment to tag this integration with. Can be used for rollbacks.')
    .option('-s, --sync [syncName]', 'Optional deploy only this sync name.')
    .option('--no-compile-interfaces', `Don't compile the ${nangoConfigFile}`, true)
    .action(async function (this: Command) {
        const options = this.opts();
        (async (options: DeployOptions) => {
            const { staging } = options;
            let env = staging ? 'staging' : 'production';
            env = options.local ? 'local' : env;
            await deploy({ ...options, env: env as ENV });
        })(options as DeployOptions);
    });

program
    .command('deploy:staging')
    .description('Deploy a Nango integration to staging')
    .option('-v, --version [version]', 'Optional: Set a version of this deployment to tag this integration with. Can be used for rollbacks.')
    .option('--no-compile-interfaces', `Don't compile the ${nangoConfigFile}`, true)
    .action(async function (this: Command) {
        const options = this.opts();
        (async (options: DeployOptions) => {
            await deploy({ ...options, env: 'staging' });
        })(options as DeployOptions);
    });

program
    .command('deploy:local')
    .description('Deploy a Nango integration to local')
    .option('-v, --version [version]', 'Optional: Set a version of this deployment to tag this integration with. Can be used for rollbacks.')
    .option('--no-compile-interfaces', `Don't compile the ${nangoConfigFile}`, true)
    .action(async function (this: Command) {
        const options = this.opts();
        (async (options: DeployOptions) => {
            await deploy({ ...options, env: 'local' });
        })(options as DeployOptions);
    });

program
    .command('sync:config.check')
    .alias('scc')
    .description('Verify the parsed sync config and output the object for verification')
    .action(async () => {
        await verifyNecessaryFiles();
        const cwd = process.cwd();
        const config = await loadSimplifiedConfig(path.resolve(cwd, NANGO_INTEGRATIONS_LOCATION));

        console.log(chalk.green(JSON.stringify(config, null, 2)));
    });

program
    .command('sync:run')
    .alias('sr')
    .description('Run the sync process to help with debugging. Assumes local development environment.')
    .option('-s, --sync <syncName>', 'The name of the sync (e.g. account-sync).')
    .option('-p, --provider <provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .option('-c, --connection <connection_id>', 'The ID of the Connection.')
    .option('-l, --lastSyncDate [lastSyncDate]', 'Optional: last sync date to retrieve records greater than this date')
    .action(async function (this: Command) {
        await verifyNecessaryFiles();
        run(this.args, this.opts());
    });

program.parse();
