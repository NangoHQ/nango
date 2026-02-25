import chalk from 'chalk';
import inquirer from 'inquirer';

import { Nango } from '@nangohq/node';

import { FUNCTION_TYPES } from '../types.js';
import { getEnvironments, parseSecretKey } from '../utils.js';

import type { FunctionType } from '../types.js';
import type { GetPublicConnections } from '@nangohq/types';

const NEW_INTEGRATION_CHOICE = 'Create new integration';
const OTHER_CHOICE = 'Other';

export async function promptForFunctionType(): Promise<FunctionType> {
    const { type } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'type',
            message: 'What type of function do you want to create?',
            choices: [...FUNCTION_TYPES]
        }
    ]);
    return type;
}

export async function promptForIntegrationName({ integrations }: { integrations: string[] }): Promise<string> {
    if (integrations.length > 0) {
        const { integration } = await inquirer.prompt([
            {
                type: 'rawlist',
                name: 'integration',
                message: 'Which integration does this belong to?',
                choices: [...integrations, new inquirer.Separator(), NEW_INTEGRATION_CHOICE]
            }
        ]);

        if (integration === NEW_INTEGRATION_CHOICE) {
            const { newIntegration } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'newIntegration',
                    message: 'What is the name of the new integration? (e.g., "hubspot")'
                }
            ]);
            return newIntegration;
        }
        return integration;
    } else {
        const { integration } = await inquirer.prompt([
            {
                type: 'input',
                name: 'integration',
                message: 'What is the name of the integration? (e.g., "hubspot")'
            }
        ]);
        return integration;
    }
}

export async function promptForFunctionName(type: FunctionType): Promise<string> {
    const { name } = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: `What is the name of the new ${type}? (e.g., "contacts" or "create-ticket")`
        }
    ]);
    return name;
}

export async function promptForEnvironment(debug = false): Promise<string> {
    let choices = ['dev', 'prod', new inquirer.Separator(), OTHER_CHOICE];

    const environments = await getEnvironments(debug);
    if (environments) {
        if (environments.data.length > 0) {
            choices = environments.data.map((e) => e.name);
        } else {
            console.log(chalk.yellow('Warning: No environments found. Using default options.'));
        }
    } else {
        console.log(chalk.yellow('Warning: Could not fetch environments. Using default options.'));
    }

    const { env } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'env',
            message: 'Which environment do you want to use?',
            choices
        }
    ]);

    if (env === OTHER_CHOICE) {
        const { customEnv } = await inquirer.prompt([
            {
                type: 'input',
                name: 'customEnv',
                message: 'Enter the custom environment name:'
            }
        ]);
        return customEnv;
    }

    return env;
}

export async function promptForIntegration(integrations: string[]): Promise<string> {
    const { integration } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'integration',
            message: 'Multiple integrations have this script. Which one do you want to use?',
            choices: integrations
        }
    ]);
    return integration;
}

export async function promptForFunctionToRun(functions: { name: string; type: string; integration: string }[]): Promise<{ name: string; integration: string }> {
    const { func } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'func',
            message: 'Which function do you want to dry run?',
            choices: functions.map((f) => ({
                name: `${f.integration} - ${f.name} (${f.type})`,
                value: { name: f.name, integration: f.integration }
            }))
        }
    ]);
    return func;
}

export async function promptForConnection(environment: string, integrationId?: string): Promise<string> {
    await parseSecretKey(environment);
    const nango = new Nango({ secretKey: String(process.env['NANGO_SECRET_KEY']) });
    let connections: GetPublicConnections['Success'];
    try {
        connections = await nango.listConnections(integrationId ? { integrationId } : {});
    } catch (err: any) {
        throw new Error(`Failed to list connections: ${err.message}`, { cause: err });
    }

    if (connections.connections.length === 0) {
        const msg = integrationId
            ? `No connections found for integration "${integrationId}". Please create a connection first.`
            : 'No connections found in your project for the selected environment. Please create a connection first.';
        throw new Error(msg);
    }
    const { connection } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'connection',
            message: 'Which connection do you want to use?',
            choices: connections.connections.map((c) => ({
                name: `${c.provider} - ${c.connection_id}`,
                value: c.connection_id
            }))
        }
    ]);
    return connection;
}

export async function inferIntegrationsFromConnectionId(connectionId: string, environment: string): Promise<string[]> {
    await parseSecretKey(environment);
    const nango = new Nango({ secretKey: String(process.env['NANGO_SECRET_KEY']) });
    try {
        const result = await nango.listConnections({ connectionId });
        return result.connections.map((c) => c.provider_config_key);
    } catch {
        // silently ignore: callers should treat an empty array as "couldn't infer"
        return [];
    }
}

export async function promptForProjectPath(): Promise<string> {
    const { pathInput } = await inquirer.prompt([
        {
            type: 'input',
            name: 'pathInput',
            message: 'Enter the path to initialize the Nango project in (defaults to nango-integrations):',
            default: 'nango-integrations'
        }
    ]);
    return pathInput;
}
