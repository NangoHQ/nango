import inquirer from 'inquirer';

import { Nango } from '@nangohq/node';

import { FUNCTION_TYPES } from '../types.js';
import { parseSecretKey } from '../utils.js';

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

export async function promptForEnvironment(): Promise<string> {
    const { env } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'env',
            message: 'Which environment do you want to use?',
            choices: ['dev', 'prod', new inquirer.Separator(), OTHER_CHOICE]
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

export async function promptForFunctionToRun(functions: { name: string; type: string }[]): Promise<string> {
    const { func } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'func',
            message: 'Which function do you want to dry run?',
            choices: functions.map((f) => ({
                name: `${f.name} (${f.type})`,
                value: f.name
            }))
        }
    ]);
    return func;
}

export async function promptForConnection(environment: string): Promise<string> {
    await parseSecretKey(environment);
    const nango = new Nango({ secretKey: String(process.env['NANGO_SECRET_KEY']) });
    let connections: GetPublicConnections['Success'];
    try {
        connections = await nango.listConnections();
    } catch (err: any) {
        throw new Error(`Failed to list connections: ${err.message}`, { cause: err });
    }

    if (connections.connections.length === 0) {
        throw new Error('No connections found in your project for the selected environment. Please create a connection first.');
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
