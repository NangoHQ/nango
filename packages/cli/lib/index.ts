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

import { initAI } from './ai/init.js';
import { generate, getVersionOutput, tscWatch } from './cli.js';
import { migrateToZeroYaml } from './migrations/toZeroYaml.js';
import { compileAllFiles } from './services/compile.service.js';
import { parse } from './services/config.service.js';
import deployService from './services/deploy.service.js';
import { generate as generateDocs } from './services/docs.service.js';
import { DryRunService } from './services/dryrun.service.js';
import { Ensure } from './services/ensure.service.js';
import { create } from './services/function-create.service.js';
import { directoryMigration, endpointMigration, v1toV2Migration } from './services/migration.service.js';
import { generateTests } from './services/test.service.js';
import verificationService from './services/verification.service.js';
import { MissingArgumentError } from './utils/errors.js';
import { NANGO_INTEGRATIONS_LOCATION, getNangoRootPath, isCI, printDebug, upgradeAction } from './utils.js';
import { checkAndSyncPackageJson } from './zeroYaml/check.js';
import { compileAll } from './zeroYaml/compile.js';
import { buildDefinitions } from './zeroYaml/definitions.js';
import { deploy } from './zeroYaml/deploy.js';
import { dev } from './zeroYaml/dev.js';
import { initZero } from './zeroYaml/init.js';
import { ReadableError } from './zeroYaml/utils.js';

import type { DeployOptions, GlobalOptions } from './types.js';
import type { NangoYamlParsed } from '@nangohq/types';

class NangoCommand extends Command {
    override createCommand(name: string) {
        const cmd = new Command(name);
        cmd.option('--auto-confirm', 'Auto confirm yes to all prompts.', false);
        cmd.option('--debug', 'Run cli in debug mode, outputting verbose logs.', false);
        // Defining the option with --no- prefix makes it true by default.
        // The option name in the code will be 'interactive'.
        // Passing --no-interactive will set it to false.
        cmd.option('--no-interactive', 'Disable interactive prompts for missing arguments.');

        cmd.hook('preAction', async function (this: Command, actionCommand: Command) {
            const opts = actionCommand.opts<GlobalOptions>();

            // opts.interactive is true by default (from the option default), or false if --no-interactive is passed.
            // We also disable it if we are in a CI environment.
            if (isCI && opts.interactive) {
                console.warn(
                    chalk.yellow(
                        "CI environment detected. Interactive mode has been automatically disabled to prevent hanging. Pass '--no-interactive' to silence this warning."
                    )
                );
            }
            opts.interactive = opts.interactive && !isCI;

            printDebug(`Running in ${opts.interactive ? 'interactive' : 'non-interactive'} mode.`, opts.debug);

            if (opts.debug && fs.existsSync('.env')) {
                printDebug('.env file detected and loaded', opts.debug);
            }

            if (!isCI) {
                await upgradeAction(opts.debug);
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

// don't allow global options to leak into sub commands
program.enablePositionalOptions(true);

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
    .option('--copy', 'Optional: Only copy files, will not npm install or pre-compile', false)
    .action(async function (this: Command) {
        const { debug, ai, copy, interactive } = this.opts<GlobalOptions & { ai: string[]; copy: boolean }>();
        let [projectPath] = this.args;
        const currentPath = process.cwd();

        try {
            const ensure = new Ensure(interactive);
            projectPath = await ensure.projectPath(projectPath);
        } catch (err: any) {
            console.error(chalk.red(err.message));
            process.exit(1);
        }

        const absolutePath = path.resolve(currentPath, projectPath);

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

        const res = await initZero({ absolutePath, debug, onlyCopy: copy });
        if (!res) {
            process.exitCode = 1;
            return;
        }

        await setupAI();
        console.log(chalk.green(`Nango integrations initialized in ${absolutePath}`));
        return;
    });

program
    .command('create')
    .description('Create a new Nango function scaffold')
    .option('--sync', 'Create a new sync scaffold')
    .option('--action', 'Create a new action scaffold')
    .option('--on-event', 'Create a new on event scaffold')
    .argument('[integration]', 'Integration name, e.g. "google-calendar"')
    .argument('[name]', 'Name of the sync/action, e.g. "calendar-events"')
    .action(async function (this: Command) {
        const { debug, sync, action, onEvent, interactive } = this.opts();
        let [integration, name] = this.args;
        const absolutePath = process.cwd();

        const precheck = await verificationService.preCheck({ fullPath: absolutePath, debug: debug });
        if (!precheck.isZeroYaml) {
            console.log(chalk.yellow(`Function creation skipped - detected nango yaml project`));
            return;
        }

        try {
            const ensure = new Ensure(interactive);
            const functionType = await ensure.functionType(sync, action, onEvent);

            let integrations: string[] = [];
            if (precheck.isNango) {
                const definitions = await buildDefinitions({ fullPath: absolutePath, debug: debug });
                if (definitions.isOk()) {
                    integrations = definitions.value.integrations.flatMap((i) => i.providerConfigKey);
                } else {
                    console.error(chalk.red(definitions.error));
                }
            }

            integration = await ensure.integration(integration, { integrations });
            name = await ensure.functionName(name, functionType);

            await create({ absolutePath, functionType, integration, name });
        } catch (err: any) {
            console.error(chalk.red(err.message));
            if (err instanceof MissingArgumentError) {
                this.help();
            }
            process.exit(1);
        }
    });

program
    .command('compile')
    .description(
        'Compile the integration files to JavaScript and update the .nango directory. This is useful for one off changes instead of watching for changes continuously.'
    )
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
            const resCheck = await checkAndSyncPackageJson({ fullPath, debug });
            if (resCheck.isErr()) {
                console.log(chalk.red('Failed to check and sync package.json. Exiting'));
                process.exitCode = 1;
                return;
            }

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
    .command('dryrun')
    .description('Dry run the sync|action process to help with debugging against an existing connection in cloud.')
    .argument('[name]', 'The name of the sync or action to run.')
    .argument('[connection_id]', 'The ID of the connection to use.')
    .option('-e, --environment [environment]', 'The Nango environment, defaults to dev.', 'dev')
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
    .option('--save-responses', 'Optional: Save all dry run responses to a tests/mocks directory to be used alongside unit tests', false)
    .option('--validate, --validation', 'Optional: Enforce input, output and records validation', false)
    .option('--save, --save-responses', 'Optional: Save all dry run responses to a tests/mocks directory to be used alongside unit tests', false)
    .option('--diagnostics', 'Optional: Display performance diagnostics including memory usage and CPU metrics', false)
    .action(async function (this: Command) {
        const { autoConfirm, debug, interactive, integrationId, validation, saveResponses } = this.opts();
        const shouldValidate = validation || saveResponses;
        const fullPath = process.cwd();
        let [name, connectionId] = this.args;
        let { e: environment } = this.opts();

        const precheck = await verificationService.preCheck({ fullPath, debug });
        if (!precheck.isNango) {
            console.error(chalk.red(`Not inside a Nango folder`));
            process.exitCode = 1;
            return;
        }

        try {
            const ensure = new Ensure(interactive);
            environment = await ensure.environment(environment);

            const definitions = await buildDefinitions({ fullPath, debug });
            if (definitions.isOk()) {
                const functions = definitions.value.integrations
                    .flatMap((i) => [...i.syncs, ...i.actions])
                    .map((f) => ({ name: f.name, type: f.type as string }));
                name = await ensure.function(name, functions);
            } else {
                console.error(chalk.red('Could not build function definitions to select from.'));
                process.exit(1);
            }

            connectionId = await ensure.connection(connectionId, environment);
        } catch (err: any) {
            console.error(chalk.red(err.message));
            if (err instanceof MissingArgumentError) {
                this.help();
            }
            process.exit(1);
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
            const resCheck = await checkAndSyncPackageJson({ fullPath, debug });
            if (resCheck.isErr()) {
                console.log(chalk.red('Failed to check and sync package.json. Exiting'));
                process.exitCode = 1;
                return;
            }

            const res = await compileAll({ fullPath, debug });
            if (res.isErr()) {
                process.exitCode = 1;
                return;
            }
        }

        const dryRun = new DryRunService({ fullPath, validation: shouldValidate, isZeroYaml: precheck.isZeroYaml });
        await dryRun.run({
            autoConfirm,
            debug,
            interactive,
            sync: name,
            connectionId,
            optionalEnvironment: environment,
            optionalProviderConfigKey: integrationId,
            saveResponses
        });
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
            const resCheck = await checkAndSyncPackageJson({ fullPath, debug });
            if (resCheck.isErr()) {
                console.log(chalk.red('Failed to check and sync package.json. Exiting'));
                process.exitCode = 1;
                return;
            }

            await dev({ fullPath, debug });
            return;
        }

        tscWatch({ fullPath, debug, watchConfigFile: compileInterfaces });
    });

program
    .command('deploy')
    .description('Deploy a Nango integration')
    .argument('[environment]', 'The target environment (e.g., "dev" or "prod")')
    .option('-v, --version [version]', 'Optional: Set a version of this deployment to tag this integration with.')
    .option('-s, --sync [syncName]', 'Optional deploy only this sync name.')
    .option('-a, --action [actionName]', 'Optional deploy only this action name.')
    .option('-i, --integration [integrationId]', 'Optional: Deploy all scripts related to a specific integration.')
    .option('--no-compile-interfaces', `Don't compile the ${nangoConfigFile}`, true)
    .option('--allow-destructive', 'Allow destructive changes to be deployed without confirmation', false)
    .action(async function (this: Command, environment?: string) {
        const options = this.opts<DeployOptions>();
        const { debug, interactive } = options;
        const fullPath = process.cwd();

        try {
            const ensure = new Ensure(interactive);
            environment = await ensure.environment(environment);
        } catch (err: any) {
            console.error(chalk.red(err.message));
            if (err instanceof MissingArgumentError) {
                this.help();
            }
            process.exit(1);
        }

        const precheck = await verificationService.preCheck({ fullPath, debug });
        if (!precheck.isNango) {
            console.error(chalk.red(`Not inside a Nango folder`));
            process.exitCode = 1;
            return;
        }

        if (precheck.isZeroYaml) {
            const resCheck = await checkAndSyncPackageJson({ fullPath, debug });
            if (resCheck.isErr()) {
                console.log(chalk.red('Failed to check and sync package.json. Exiting'));
                process.exitCode = 1;
                return;
            }

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
    .description('Generate documentation for the integration functions')
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
            const resCheck = await checkAndSyncPackageJson({ fullPath, debug });
            if (resCheck.isErr()) {
                console.log(chalk.red('Failed to check and sync package.json. Exiting'));
                process.exitCode = 1;
                return;
            }

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

program
    .command('generate:tests')
    .option('-i, --integration <integrationId>', 'Generate tests only for a specific integration')
    .option('-s, --sync <syncName>', 'Generate tests only for a specific sync')
    .option('-a, --action <actionName>', 'Generate tests only for a specific action')
    .description('Generate tests for integration scripts and config files')
    .action(async function (this: Command) {
        const { debug, integration: integrationId, sync: syncName, action: actionName, autoConfirm } = this.opts();
        const absolutePath = path.resolve(process.cwd(), this.args[0] || '');

        const precheck = await verificationService.preCheck({ fullPath: absolutePath, debug });
        if (!precheck.isZeroYaml) {
            console.log(chalk.yellow(`Test generation skipped - detected nango yaml project`));
            return;
        }

        const { success, generatedFiles } = await generateTests({
            absolutePath,
            integrationId,
            syncName,
            actionName,
            debug: Boolean(debug),
            autoConfirm: Boolean(autoConfirm)
        });

        if (success) {
            if (generatedFiles.length > 0) {
                console.log(chalk.green(`Generated ${generatedFiles.length} test file(s):`));
                for (const file of generatedFiles) {
                    console.log(chalk.cyan(`  ${path.relative(process.cwd(), file)}`));
                }
            } else {
                console.log(chalk.yellow(`No test files were generated. Make sure you have mocks in place.`));
            }
        } else {
            console.log(chalk.red(`Failed to generate tests`));
        }
    });

// Hidden commands //
program
    .command('generate', { hidden: true })
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
    .command('cli-location', { hidden: true })
    .alias('cli')
    .action(() => {
        getNangoRootPath(true);
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

program.parse();
