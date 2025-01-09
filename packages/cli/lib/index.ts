#!/usr/bin/env node

/*
 * Copyright (c) 2024 Nango, all rights reserved.
 */

import { Command } from 'commander';
import fs from 'fs';
import chalk from 'chalk';
import figlet from 'figlet';
import path from 'path';
import * as dotenv from 'dotenv';

import { init, generate, tscWatch, configWatch, version } from './cli.js';
import deployService from './services/deploy.service.js';
import { compileAllFiles } from './services/compile.service.js';
import verificationService from './services/verification.service.js';
import { DryRunService } from './services/dryrun.service.js';
import { v1toV2Migration, directoryMigration, endpointMigration } from './services/migration.service.js';
import { getNangoRootPath, upgradeAction, NANGO_INTEGRATIONS_LOCATION, printDebug, isCI } from './utils.js';
import type { DeployOptions } from './types.js';
import { parse } from './services/config.service.js';
import { nangoConfigFile } from '@nangohq/nango-yaml';

class NangoCommand extends Command {
    override createCommand(name: string) {
        const cmd = new Command(name);
        cmd.option('--auto-confirm', 'Auto confirm yes to all prompts.');
        cmd.option('--debug', 'Run cli in debug mode, outputting verbose logs.');
        cmd.hook('preAction', async function (this: Command, actionCommand: Command) {
            const { debug } = actionCommand.opts();
            if (debug) {
                printDebug('Debug mode enabled');
                if (fs.existsSync('.env')) {
                    printDebug('.env file detected and loaded');
                }
            }

            if (!isCI) {
                await upgradeAction(debug);
            }
        });

        return cmd;
    }
}

const program = new NangoCommand();

dotenv.config();

program.name('nango').description(
    `The CLI requires that you set the NANGO_SECRET_KEY_DEV and NANGO_SECRET_KEY_PROD env variables.

In addition for self-Hosting: set the NANGO_HOSTPORT env variable.

Global flag: --auto-confirm - automatically confirm yes to all prompts.

Available environment variables available:

# Recommendation: in a ".env" file in ./nango-integrations.

# Authenticates the CLI (get the keys in the dashboard's Environment Settings).
NANGO_SECRET_KEY_DEV=xxxx-xxx-xxxx
NANGO_SECRET_KEY_PROD=xxxx-xxx-xxxx

# Nango's instance URL (OSS: change to http://localhost:3003 or your instance URL).
NANGO_HOSTPORT=https://api.nango.dev # Default value

# How to handle CLI upgrades ("prompt", "auto" or "ignore").
NANGO_CLI_UPGRADE_MODE=prompt # Default value

# Whether to prompt before deployments.
NANGO_DEPLOY_AUTO_CONFIRM=false # Default value
`
);

program.addHelpText('before', chalk.green(figlet.textSync('Nango CLI')));

program
    .command('version')
    .description('Print the version of the Nango CLI and Nango Server.')
    .action(function (this: Command) {
        const { debug } = this.opts();
        version(debug);
    });

program
    .command('init')
    .description('Initialize a new Nango project')
    .action(function (this: Command) {
        const { debug } = this.opts();
        const fullPath = process.cwd();
        init({ absolutePath: fullPath, debug });

        console.log(chalk.green(`Nango integrations initialized!`));
    });

program
    .command('generate')
    .description('Generate a new Nango integration')
    .action(function (this: Command) {
        const { debug } = this.opts();
        generate({ fullPath: process.cwd(), debug });
    });

program
    .command('dryrun')
    .description('Dry run the sync|action process to help with debugging against an existing connection in cloud.')
    .arguments('name connection_id')
    .option('-e [environment]', 'The Nango environment, defaults to dev.', 'dev')
    .option(
        '-l, --lastSyncDate [lastSyncDate]',
        'Optional (for syncs only): last sync date to retrieve records greater than this date. The format is any string that can be successfully parsed by `new Date()` in JavaScript'
    )
    .option(
        '-i, --input [input]',
        'Optional (for actions only): input to pass to the action script. The `input` can be supplied in either JSON format or as a plain string. For example --input \'{"foo": "bar"}\'  --input \'foobar\'. ' +
            'You can also pass a file path prefixed with `@` to the input and appended by `json`, for example @fixtures/data.json. Note that only json files can be passed.'
    )
    .option(
        '-m, --metadata [metadata]',
        'Optional (for syncs only): metadata to stub for the sync script supplied in JSON format, for example --metadata \'{"foo": "bar"}\'. ' +
            'You can also pass a file path prefixed with `@` to the metadata and appended by `json`, for example @fixtures/metadata.json. Note that only json files can be passed.'
    )
    .option(
        '--integration-id [integrationId]',
        'Optional: The integration id to use for the dryrun. If not provided, the integration id will be retrieved from the nango.yaml file. This is useful using nested directories and script names are repeated'
    )
    .option('--validation', 'Optional: Enforce input, output and records validation', false)
    .option('--save-responses', 'Optional: Save all dry run responses to a tests/mocks directory to be used alongside unit tests', false)
    .action(async function (this: Command, sync: string, connectionId: string) {
        const { autoConfirm, debug, e: environment, integrationId, validation, saveResponses } = this.opts();
        const fullPath = process.cwd();
        await verificationService.necessaryFilesExist({ fullPath, autoConfirm, debug });
        const dryRun = new DryRunService({ fullPath, validation });
        await dryRun.run(
            {
                ...this.opts(),
                sync,
                connectionId,
                optionalEnvironment: environment,
                optionalProviderConfigKey: integrationId,
                saveResponses
            },
            debug
        );
    });

program
    .command('dev')
    .description('Watch tsc files while developing. Set --no-compile-interfaces to disable watching the config file')
    .option('--no-compile-interfaces', `Watch the ${nangoConfigFile} and recompile the interfaces on change`, true)
    .action(async function (this: Command) {
        const { compileInterfaces, autoConfirm, debug } = this.opts();
        const fullPath = process.cwd();
        await verificationService.necessaryFilesExist({ fullPath, autoConfirm, debug, checkDist: false });

        if (compileInterfaces) {
            configWatch({ fullPath, debug });
        }

        tscWatch({ fullPath, debug });
    });

program
    .command('deploy')
    .description('Deploy a Nango integration')
    .arguments('environment')
    .option('-v, --version [version]', 'Optional: Set a version of this deployment to tag this integration with. Can be used for rollbacks.')
    .option('-s, --sync [syncName]', 'Optional deploy only this sync name.')
    .option('-a, --action [actionName]', 'Optional deploy only this action name.')
    .option('--no-compile-interfaces', `Don't compile the ${nangoConfigFile}`, true)
    .option('--allow-destructive', 'Allow destructive changes to be deployed without confirmation', false)
    .action(async function (this: Command, environment: string) {
        const options: DeployOptions = this.opts();
        const { debug } = options;
        const fullPath = process.cwd();
        await deployService.prep({ fullPath, options: { ...options, env: 'cloud' }, environment, debug });
    });

program
    .command('migrate-config')
    .description('Migrate the nango.yaml from v1 (deprecated) to v2')
    .action(function (this: Command) {
        v1toV2Migration(path.resolve(process.cwd(), NANGO_INTEGRATIONS_LOCATION));
    });

program
    .command('migrate-to-directories')
    .description('Migrate the script files from root level to structured directories.')
    .action(async function (this: Command) {
        const { debug } = this.opts();
        await directoryMigration(path.resolve(process.cwd(), NANGO_INTEGRATIONS_LOCATION), debug);
    });

program
    .command('migrate-endpoints')
    .description('Migrate the endpoint format')
    .action(function (this: Command) {
        endpointMigration(path.resolve(process.cwd(), NANGO_INTEGRATIONS_LOCATION));
    });

// Hidden commands //

program
    .command('deploy:local', { hidden: true })
    .alias('dl')
    .description('Deploy a Nango integration to local')
    .arguments('environment')
    .option('-v, --version [version]', 'Optional: Set a version of this deployment to tag this integration with. Can be used for rollbacks.')
    .option('--no-compile-interfaces', `Don't compile the ${nangoConfigFile}`, true)
    .option('--allow-destructive', 'Allow destructive changes to be deployed without confirmation', false)
    .action(async function (this: Command, environment: string) {
        const options: DeployOptions = this.opts();
        const fullPath = process.cwd();
        await deployService.prep({ fullPath, options: { ...options, env: 'local' }, environment, debug: options.debug });
    });

program
    .command('cli-location', { hidden: true })
    .alias('cli')
    .action(() => {
        getNangoRootPath(true);
    });

program
    .command('compile', { hidden: true })
    .description('Compile the integration files to JavaScript')
    .action(async function (this: Command) {
        const { autoConfirm, debug } = this.opts();
        const fullPath = process.cwd();
        await verificationService.necessaryFilesExist({ fullPath, autoConfirm, debug, checkDist: false });

        const match = verificationService.filesMatchConfig({ fullPath });
        if (!match) {
            process.exitCode = 1;
            return;
        }

        const success = await compileAllFiles({ fullPath, debug });
        if (!success) {
            console.log(chalk.red('Compilation was not fully successful. Please make sure all files compile before deploying'));
            process.exitCode = 1;
        }
    });

program
    .command('sync:config.check', { hidden: true })
    .alias('scc')
    .description('Verify the parsed sync config and output the object for verification')
    .action(async function (this: Command) {
        const { autoConfirm, debug } = this.opts();
        const fullPath = process.cwd();
        await verificationService.necessaryFilesExist({ fullPath, autoConfirm, debug });
        const parsing = parse(path.resolve(fullPath, NANGO_INTEGRATIONS_LOCATION));
        if (parsing.isErr()) {
            console.log(chalk.red(parsing.error.message));
            process.exitCode = 1;
            return;
        }

        console.log(chalk.green(JSON.stringify({ ...parsing.value.parsed, models: Array.from(parsing.value.parsed!.models.values()) }, null, 2)));
    });

// admin only commands
program
    .command('admin:deploy', { hidden: true })
    .description('Deploy a Nango integration to an account')
    .arguments('environmentName')
    .action(async function (this: Command, environmentName: string) {
        const { debug } = this.opts();
        const fullPath = process.cwd();
        await deployService.admin({ fullPath, environmentName, debug });
    });

program
    .command('admin:deploy-internal', { hidden: true })
    .description('Deploy a Nango integration to the internal Nango dev account')
    .arguments('environment')
    .option('-nre, --nango-remote-environment [nre]', 'Optional: Set the Nango remote environment (local, cloud).')
    .action(async function (this: Command, environment: string) {
        const { debug, nangoRemoteEnvironment } = this.opts();
        const fullPath = process.cwd();
        await deployService.internalDeploy({ fullPath, environment, debug, options: { env: nangoRemoteEnvironment || 'prod' } });
    });

program.parse();
