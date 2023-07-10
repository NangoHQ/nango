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
        cmd.option('--auto-confirm', 'Auto confirm yes to all prompts.');
        cmd.option('--environment', 'Set which environment to run in');
        cmd.option('--debug', 'Run cli in debug mode, outputting verbose logs.');
        cmd.hook('preAction', async function (this: Command, actionCommand: Command) {
            const { debug } = actionCommand.opts();
            await upgradeAction(debug);
        });

        return cmd;
    }
}

const program = new NangoCommand();

dotenv.config();

program.name('nango').description(
    `By default, the CLI assumes that you are using Nango Cloud so you need to set the NANGO_SECRET_KEY env variable or pass in the --secret-key flag with each command.

For Self-Hosting: set the NANGO_HOSTPORT env variable or pass in the --host flag with each command.

Global flags: --secret-key, --host, --auto-confirm, --debug (output verbose logs for debugging purposes)

Available environment variables available:

NANGO_HOSTPORT=https://api.nango.dev | http://localhost:3003 | your-self-hosted-address
NANGO_AUTO_UPGRADE=true // upgrade the CLI automatically
NANGO_NO_PROMPT_FOR_UPGRADE=false // don't prompt for upgrades
NANGO_DEPLOY_AUTO_CONFIRM=false // deploy without any prompts
NANGO_SECRET_KEY=xxxx-xxx-xxxx // Required for Nango Cloud to authenticate
NANGO_INTEGRATIONS_LOCATION=use-this-to-override-where-the-nango-integrations-directory-goes // set a custom location for the nango-integrations directory
NANGO_PORT=use-this-to-override-the-default-3003 // set a custom port for the Nango Server
NANGO_DB_PORT=use-this-to-override-the-default-5432 // set a custom port for the Nango database
`
);

program.addHelpText('before', chalk.green(figlet.textSync('Nango CLI')));

program
    .command('version')
    .description('Print the version of the Nango CLI, Nango Worker, and Nango Server.')
    .action(function (this: Command) {
        const { debug } = this.opts();
        version(debug);
    });

program
    .command('init')
    .description('Initialize a new Nango project')
    .action(function (this: Command) {
        const { debug } = this.opts();
        init(debug);
    });

program
    .command('generate')
    .description('Generate a new Nango integration')
    .action(async function (this: Command) {
        const { autoConfirm, debug } = this.opts();
        await verifyNecessaryFiles(autoConfirm, debug);
        generate(debug);
    });

program
    .command('run')
    .description('Run the sync process to help with debugging. Assumes local development environment.')
    .option('-s, --sync <syncName>', 'The name of the sync (e.g. account-sync).')
    .option('-p, --provider <provider_config_key>', 'The unique key of the provider configuration (chosen by you upon creating this provider configuration).')
    .option('-c, --connection <connection_id>', 'The ID of the Connection.')
    .option('-l, --lastSyncDate [lastSyncDate]', 'Optional: last sync date to retrieve records greater than this date')
    .action(async function (this: Command) {
        const { autoConfirm, debug } = this.opts();
        await verifyNecessaryFiles(autoConfirm, debug);
        run(this.args, this.opts(), debug);
    });

program
    .command('dev')
    .description('Watch tsc files while developing. Set --no-compile-interfaces to disable watching the config file')
    .option('--no-compile-interfaces', `Watch the ${nangoConfigFile} and recompile the interfaces on change`, true)
    .action(async function (this: Command) {
        const { compileInterfaces, autoConfirm, debug } = this.opts();
        await verifyNecessaryFiles(autoConfirm, debug);

        if (compileInterfaces) {
            configWatch(debug);
        }

        tscWatch(debug);
    });

program
    .command('deploy')
    .description('Deploy a Nango integration')
    .option('--staging', 'Deploy to the staging instance')
    .option('--local', 'Deploy to the local instance')
    .option('-v, --version [version]', 'Optional: Set a version of this deployment to tag this integration with. Can be used for rollbacks.')
    .option('-s, --sync [syncName]', 'Optional deploy only this sync name.')
    .option('--no-compile-interfaces', `Don't compile the ${nangoConfigFile}`, true)
    .action(async function (this: Command) {
        const options = this.opts();
        (async (options: DeployOptions) => {
            const { staging, debug } = options;
            let env = staging ? 'staging' : 'production';
            env = options.local ? 'local' : env;
            await deploy({ ...options, env: env as ENV }, debug);
        })(options as DeployOptions);
    });

// Hidden commands //

program
    .command('deploy:local', { hidden: true })
    .alias('dl')
    .description('Deploy a Nango integration to local')
    .option('-v, --version [version]', 'Optional: Set a version of this deployment to tag this integration with. Can be used for rollbacks.')
    .option('--no-compile-interfaces', `Don't compile the ${nangoConfigFile}`, true)
    .action(async function (this: Command) {
        const options = this.opts();
        (async (options: DeployOptions) => {
            await deploy({ ...options, env: 'local' }, options.debug);
        })(options as DeployOptions);
    });

program
    .command('compile', { hidden: true })
    .description('Compile the integration files to JavaScript')
    .action(async function (this: Command) {
        const { autoConfirm, debug } = this.opts();
        await verifyNecessaryFiles(autoConfirm, debug);
        tsc(debug);
    });

program
    .command('sync:dev', { hidden: true })
    .description('Work locally to develop integration code')
    .option('--no-compile-interfaces', `Watch the ${nangoConfigFile} and recompile the interfaces on change`, true)
    .action(async function (this: Command) {
        const { compileInterfaces, autoConfirm, debug } = this.opts();
        await verifyNecessaryFiles(autoConfirm, debug);
        if (compileInterfaces) {
            configWatch(debug);
        }

        tscWatch(debug);
        await dockerRun(debug);
    });

program
    .command('sync:docker.run', { hidden: true })
    .description('Run the docker container locally')
    .action(async function (this: Command) {
        const { debug } = this.opts();
        await dockerRun(debug);
    });

program
    .command('sync:config.check', { hidden: true })
    .alias('scc')
    .description('Verify the parsed sync config and output the object for verification')
    .action(async function (this: Command) {
        const { autoConfirm } = this.opts();
        await verifyNecessaryFiles(autoConfirm);
        const cwd = process.cwd();
        const config = await loadSimplifiedConfig(path.resolve(cwd, NANGO_INTEGRATIONS_LOCATION));

        console.log(chalk.green(JSON.stringify(config, null, 2)));
    });

program.parse();
