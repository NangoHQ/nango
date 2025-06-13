#!/usr/bin/env node

/*
 * Copyright (c) 2025 Nango, all rights reserved.
 */

import fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import { Command } from 'commander';
import * as dotenv from 'dotenv';
import figlet from 'figlet';
import { nangoConfigFile } from '@nangohq/nango-yaml';

import { generate, getVersionOutput, tscWatch } from './cli.js';
import { migrateToZeroYaml } from './migrations/toZeroYaml.js';
import { compileAllFiles } from './services/compile.service.js';
import { parse } from './services/config.service.js';
import deployService from './services/deploy.service.js';
import { generate as generateDocs } from './services/docs.service.js';
import { DryRunService } from './services/dryrun.service.js';
import { init } from './services/init.service.js';
import { directoryMigration, endpointMigration, v1toV2Migration } from './services/migration.service.js';
import verificationService from './services/verification.service.js';
import { NANGO_INTEGRATIONS_LOCATION, getNangoRootPath, isCI, printDebug, upgradeAction } from './utils.js';
import { compileAll } from './zeroYaml/compile.js';
import { buildDefinitions } from './zeroYaml/definitions.js';
import { deploy } from './zeroYaml/deploy.js';
import { dev } from './zeroYaml/dev.js';
import { initZero } from './zeroYaml/init.js';
import { ReadableError } from './zeroYaml/utils.js';

import type { DeployOptions, GlobalOptions } from './types.js';
import type { NangoYamlParsed } from '@nangohq/types';
import { initAI } from './ai/init.js';

import { generateTests } from './services/test.service.js';

class NangoCommand extends Command {
    override createCommand(name: string) {
        const cmd = new Command(name);
        cmd.option('--auto-confirm', 'Auto confirm yes to all prompts.', false);
        cmd.option('--debug', 'Run cli in debug mode, outputting verbose logs.', false);
        cmd.option('--zero', 'Run cli in zero yaml mode (alpha)', false);
        cmd.hook('preAction', async function (this: Command, actionCommand: Command) {
            const { debug } = actionCommand.opts<GlobalOptions>();
            printDebug('Debug mode enabled', debug);
            if (debug && fs.existsSync('.env')) {
                printDebug('.env file detected and loaded', debug);
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

program
    .name('nango')
    .description(
        `The CLI requires that you set the NANGO_SECRET_KEY_DEV and NANGO_SECRET_KEY_PROD env variables.

In addition for self-Hosting: set the NANGO_HOSTPORT env variable.

Global flag: --auto-confirm - automatically confirm yes to all prompts.

Available environment variables:

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
    )
    .version(getVersionOutput(), '-v, --version', 'Print the version of the Nango CLI and Nango Server.');

program.addHelpText('before', chalk.green(figlet.textSync('Nango CLI')));

program
    .command('version')
    .description('Print the version of the Nango CLI and Nango Server.')
    .action(function (this: Command) {
        const versionOutput = getVersionOutput();
        console.log(versionOutput);
    });

program
    .command('init')
    .argument('[path]', 'Optional: The path to initialize the Nango project in. Defaults to the current directory.')
    .description('Initialize a new Nango project')
    .option('--ai [claude|cursor...]', 'Optional: Setup AI agent instructions files. Supported: claude code, cursor', [])
    .action(async function (this: Command) {
        const { debug, zero, ai } = this.opts<GlobalOptions & { ai: string[] }>();
        const currentPath = process.cwd();
        const absolutePath = path.resolve(currentPath, this.args[0] || '');

        const setupAI = async (): Promise<void> => {
            const ok = await initAI({ absolutePath, debug, aiOpts: ai });
            if (ok) {
                printDebug(`AI agent instructions files initialized in ${absolutePath}`, debug);
            }
        };

        const check = await verificationService.preCheck({ fullPath: absolutePath, debug });
        if (check.hasNangoYaml || check.isZeroYaml) {
            await setupAI();
            console.log(chalk.red(`The path provided is already a Nango integrations folder.`));
            return;
        }

        if (zero) {
            const res = await initZero({ absolutePath, debug });
            if (!res) {
                process.exitCode = 1;
                return;
            }

            await setupAI();
            console.log(chalk.green(`Nango integrations initialized in ${absolutePath}`));
            return;
        }

        const ok = init({ absolutePath, debug });
        if (!ok) {
            process.exitCode = 1;
            return;
        }

        await setupAI();
        console.log(chalk.green(`Nango integrations initialized in ${absolutePath}!`));
        return;
    });

program
    .command('generate')
    .description('Generate a new Nango integration')
    .action(async function (this: Command) {
        const { debug } = this.opts<GlobalOptions>();
        const fullPath = process.cwd();
        const precheck = await verificationService.ensureNangoYaml({ fullPath, debug });
        if (!precheck) {
            return;
        }

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
    .option('--variant [variant]', 'Optional: The variant of the sync to run for the dryrun. If not provided, the base variant will be used.')
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

        const precheck = await verificationService.preCheck({ fullPath, debug });
        if (!precheck.isNango) {
            console.error(chalk.red(`Not inside a Nango folder`));
            process.exitCode = 1;
            return;
        }

        if (!precheck.isNango || precheck.hasNangoYaml) {
            await verificationService.necessaryFilesExist({ fullPath, autoConfirm, debug });
            const { success } = await compileAllFiles({ fullPath, debug });
            if (!success) {
                console.log(chalk.red('Failed to compile. Exiting'));
                process.exitCode = 1;
                return;
            }
        } else {
            const res = await compileAll({ fullPath, debug });
            if (res.isErr()) {
                process.exitCode = 1;
                return;
            }
        }

        const dryRun = new DryRunService({ fullPath, validation, isZeroYaml: precheck.isZeroYaml });
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
        const { compileInterfaces, debug } = this.opts();
        const fullPath = process.cwd();

        const precheck = await verificationService.preCheck({ fullPath, debug });
        if (!precheck.isNango) {
            console.error(chalk.red(`Not inside a Nango folder`));
            process.exitCode = 1;
            return;
        }

        if (precheck.isZeroYaml) {
            await dev({ fullPath, debug });
            return;
        }

        tscWatch({ fullPath, debug, watchConfigFile: compileInterfaces });
    });

program
    .command('deploy')
    .description('Deploy a Nango integration')
    .arguments('environment')
    .option('-v, --version [version]', 'Optional: Set a version of this deployment to tag this integration with. Can be used for rollbacks.')
    .option('-s, --sync [syncName]', 'Optional deploy only this sync name.')
    .option('-a, --action [actionName]', 'Optional deploy only this action name.')
    .option('-i, --integration [integrationId]', 'Optional: Deploy all scripts related to a specific integration.')
    .option('--no-compile-interfaces', `Don't compile the ${nangoConfigFile}`, true)
    .option('--allow-destructive', 'Allow destructive changes to be deployed without confirmation', false)
    .action(async function (this: Command, environment: string) {
        const options = this.opts<DeployOptions>();
        const { debug } = options;
        const fullPath = process.cwd();

        const precheck = await verificationService.preCheck({ fullPath, debug });
        if (!precheck.isNango) {
            console.error(chalk.red(`Not inside a Nango folder`));
            process.exitCode = 1;
            return;
        }

        if (precheck.isZeroYaml) {
            const resCompile = await compileAll({ fullPath, debug });
            if (resCompile.isErr()) {
                process.exitCode = 1;
                return;
            }

            const res = await deploy({ fullPath, options, environmentName: environment });
            if (res.isErr()) {
                process.exitCode = 1;
                return;
            }
            return;
        }

        await deployService.prep({ fullPath, options: { ...options, env: 'cloud' }, environment, debug });
    });

program
    .command('migrate-config')
    .description('Migrate the nango.yaml from v1 (deprecated) to v2')
    .action(async function (this: Command) {
        const { debug } = this.opts<DeployOptions>();
        const fullPath = process.cwd();
        const precheck = await verificationService.ensureNangoYaml({ fullPath, debug });
        if (!precheck) {
            return;
        }

        v1toV2Migration(path.resolve(fullPath, NANGO_INTEGRATIONS_LOCATION));
    });

program
    .command('migrate-to-directories')
    .description('Migrate the script files from root level to structured directories.')
    .action(async function (this: Command) {
        const { debug } = this.opts<DeployOptions>();
        const fullPath = process.cwd();
        const precheck = await verificationService.ensureNangoYaml({ fullPath, debug });
        if (!precheck) {
            return;
        }

        await directoryMigration(path.resolve(fullPath, NANGO_INTEGRATIONS_LOCATION), debug);
    });

program
    .command('migrate-endpoints')
    .description('Migrate the endpoint format')
    .action(async function (this: Command) {
        const { debug } = this.opts<DeployOptions>();
        const fullPath = process.cwd();
        const precheck = await verificationService.ensureNangoYaml({ fullPath, debug });
        if (!precheck) {
            return;
        }

        endpointMigration(path.resolve(fullPath, NANGO_INTEGRATIONS_LOCATION));
    });

program
    .command('migrate-to-zero-yaml')
    .description('Migrate from nango.yaml to pure typescript')
    .action(async function (this: Command) {
        const { debug } = this.opts<DeployOptions>();
        const fullPath = process.cwd();
        const precheck = await verificationService.ensureNangoYaml({ fullPath, debug });
        if (!precheck) {
            return;
        }

        await migrateToZeroYaml({ fullPath, debug });
    });

program
    .command('generate:docs')
    .option('-p, --path [path]', 'Optional: The relative path to generate the docs for. Defaults to the same directory as the script.')
    .option('--integration-templates', 'Optional: for the nango integration templates repo', false)
    .description('Generate documentation for the integration scripts')
    .action(async function (this: Command) {
        const { debug, path: optionalPath, integrationTemplates } = this.opts();
        const fullPath = path.resolve(process.cwd(), this.args[0] || '');
        const precheck = await verificationService.preCheck({ fullPath, debug });
        if (!precheck.isNango) {
            console.error(chalk.red(`Not inside a Nango folder`));
            process.exitCode = 1;
            return;
        }

        let parsed: NangoYamlParsed;
        if (precheck.isZeroYaml) {
            const def = await buildDefinitions({ fullPath, debug });
            if (def.isErr()) {
                console.log('');
                console.log(def.error instanceof ReadableError ? def.error.toText() : chalk.red(def.error.message));
                process.exitCode = 1;
                return;
            }

            parsed = def.value;
        } else {
            const parsing = parse(fullPath, debug);
            if (parsing.isErr()) {
                console.log(chalk.red(`Error parsing nango.yaml: ${parsing.error}`));
                process.exitCode = 1;
                return;
            }
            parsed = parsing.value.parsed!;
        }

        const ok = await generateDocs({ absolutePath: fullPath, path: optionalPath, debug, isForIntegrationTemplates: integrationTemplates, parsed });

        if (ok) {
            console.log(chalk.green(`Docs have been generated`));
        }
    });

// Hidden commands //

program
    .command('deploy:local', { hidden: true })
    .alias('dl')
    .description('Deploy a Nango integration to local')
    .arguments('environment')
    .option('-v, --version [version]', 'Optional: Set a version of this deployment to tag this integration with. Can be used for rollbacks.')
    .option('-i, --integration [integrationId]', 'Optional: Deploy all scripts related to a specific integration/provider config key.')
    .option('--no-compile-interfaces', `Don't compile the ${nangoConfigFile}`, true)
    .option('--allow-destructive', 'Allow destructive changes to be deployed without confirmation', false)
    .action(async function (this: Command, environment: string) {
        const options = this.opts<DeployOptions>();
        const fullPath = process.cwd();
        const precheck = await verificationService.ensureNangoYaml({ fullPath, debug: options.debug });
        if (!precheck) {
            return;
        }

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
        const { debug } = this.opts<GlobalOptions>();
        const fullPath = process.cwd();
        const precheck = await verificationService.preCheck({ fullPath, debug });
        if (!precheck.isNango) {
            console.error(chalk.red(`Not inside a Nango folder`));
            process.exitCode = 1;
            return;
        }

        if (precheck.isZeroYaml) {
            const res = await compileAll({ fullPath, debug });
            if (res.isErr()) {
                process.exitCode = 1;
            }
            return;
        }

        const match = verificationService.filesMatchConfig({ fullPath });
        if (!match) {
            process.exitCode = 1;
            return;
        }

        const { success } = await compileAllFiles({ fullPath, debug });
        if (!success) {
            console.error(chalk.red('Compilation was not fully successful. Please make sure all files compile before deploying'));
            process.exitCode = 1;
        }
    });

program
    .command('sync:config.check', { hidden: true })
    .alias('scc')
    .description('Verify the parsed sync config and output the object for verification')
    .action(async function (this: Command) {
        const { autoConfirm, debug } = this.opts<GlobalOptions>();
        const fullPath = process.cwd();

        const precheck = await verificationService.ensureNangoYaml({ fullPath, debug });
        if (!precheck) {
            return;
        }

        await verificationService.necessaryFilesExist({ fullPath, autoConfirm, debug });
        const parsing = parse(path.resolve(fullPath, NANGO_INTEGRATIONS_LOCATION));
        if (parsing.isErr()) {
            console.error(chalk.red(parsing.error.message));
            process.exitCode = 1;
            return;
        }

        console.log(chalk.green(JSON.stringify({ ...parsing.value.parsed, models: Array.from(parsing.value.parsed!.models.values()) }, null, 2)));
    });

program
    .command('admin:deploy-internal', { hidden: true })
    .description('Deploy a Nango integration to the internal Nango dev account')
    .arguments('environment')
    .option('-nre, --nango-remote-environment [nre]', 'Optional: Set the Nango remote environment (local, cloud).')
    .option('-i, --integration [integrationId]', 'Optional: Deploy all scripts related to a specific integration/provider config key.')
    .action(async function (this: Command, environment: string) {
        const { debug, nangoRemoteEnvironment, integration } = this.opts();
        const fullPath = process.cwd();

        const precheck = await verificationService.ensureNangoYaml({ fullPath, debug });
        if (!precheck) {
            return;
        }

        await deployService.internalDeploy({ fullPath, environment, debug, options: { env: nangoRemoteEnvironment || 'prod', integration } });
    });

program
    .command('generate:tests')
    .option('-i, --integration <integrationId>', 'Generate tests only for a specific integration')
    .description('Generate tests for integration scripts and config files')
    .action(async function (this: Command) {
        const { debug, integration: integrationId, autoConfirm } = this.opts();
        const absolutePath = path.resolve(process.cwd(), this.args[0] || '');

        const ok = await generateTests({
            absolutePath,
            integrationId,
            debug: Boolean(debug),
            autoConfirm: Boolean(autoConfirm)
        });

        if (ok) {
            console.log(chalk.green(`Tests have been generated successfully!`));
        } else {
            console.log(chalk.red(`Failed to generate tests`));
        }
    });

program.parse();
