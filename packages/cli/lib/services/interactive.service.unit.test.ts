import inquirer from 'inquirer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    promptForConnection,
    promptForEnvironment,
    promptForFunctionName,
    promptForFunctionToRun,
    promptForFunctionType,
    promptForIntegrationName,
    promptForProjectPath
} from './interactive.service.js';
import { FUNCTION_TYPES } from '../types.js';
import * as utils from '../utils.js';

vi.mock('inquirer');

const mockedInquirer = inquirer as unknown as {
    prompt: vi.Mock;
    Separator: any;
};
mockedInquirer.Separator = vi.fn();

const mockedParseSecretKey = vi.spyOn(utils, 'parseSecretKey').mockResolvedValue(undefined);

vi.mock('@nangohq/node', () => {
    const listConnectionsMock = vi.fn();
    const Nango = vi.fn(() => ({
        listConnections: listConnectionsMock
    }));
    return { Nango, _listConnectionsMock: listConnectionsMock };
});

describe('Interactive Service', () => {
    let listConnectionsMock: vi.Mock;

    beforeEach(async () => {
        const { _listConnectionsMock } = await import('@nangohq/node');
        listConnectionsMock = _listConnectionsMock;
    });

    afterEach(() => {
        vi.clearAllMocks();
        listConnectionsMock.mockClear();
    });

    it('should prompt for function type', async () => {
        mockedInquirer.prompt.mockResolvedValue({ type: 'sync' });
        const type = await promptForFunctionType();
        expect(type).toBe('sync');
        expect(mockedInquirer.prompt).toHaveBeenCalledWith([
            {
                type: 'rawlist',
                name: 'type',
                message: expect.any(String),
                choices: [...FUNCTION_TYPES]
            }
        ]);
    });

    describe('promptForIntegrationName', () => {
        it('should list existing integrations', async () => {
            mockedInquirer.prompt.mockResolvedValue({ integration: 'hubspot-existing' });

            const name = await promptForIntegrationName({ integrations: ['hubspot-existing'] });

            expect(name).toBe('hubspot-existing');
            expect(mockedInquirer.prompt).toHaveBeenCalledWith([
                expect.objectContaining({
                    choices: ['hubspot-existing', expect.any(mockedInquirer.Separator), 'Create new integration']
                })
            ]);
        });

        it('should prompt for a new integration name if user chooses to create one', async () => {
            mockedInquirer.prompt.mockResolvedValueOnce({ integration: 'Create new integration' }).mockResolvedValueOnce({ newIntegration: 'new-one' });

            const name = await promptForIntegrationName({ integrations: ['hubspot'] });

            expect(name).toBe('new-one');
            expect(mockedInquirer.prompt).toHaveBeenCalledTimes(2);
        });

        it('should prompt for input if no integrations exist', async () => {
            mockedInquirer.prompt.mockResolvedValue({ integration: 'new-integration' });

            const name = await promptForIntegrationName({ integrations: [] });

            expect(name).toBe('new-integration');
            expect(mockedInquirer.prompt).toHaveBeenCalledWith([
                expect.objectContaining({
                    type: 'input'
                })
            ]);
        });
    });

    it('should prompt for function name', async () => {
        mockedInquirer.prompt.mockResolvedValue({ name: 'my-function' });
        const name = await promptForFunctionName('sync');
        expect(name).toBe('my-function');
        expect(mockedInquirer.prompt).toHaveBeenCalledWith([
            {
                type: 'input',
                name: 'name',
                message: expect.stringContaining('sync')
            }
        ]);
    });

    describe('promptForEnvironment', () => {
        it('should return the selected environment', async () => {
            mockedInquirer.prompt.mockResolvedValue({ env: 'dev' });
            const env = await promptForEnvironment();
            expect(env).toBe('dev');
        });

        it('should prompt for a custom environment if "Other" is selected', async () => {
            mockedInquirer.prompt.mockResolvedValueOnce({ env: 'Other' }).mockResolvedValueOnce({ customEnv: 'staging' });

            const env = await promptForEnvironment();

            expect(env).toBe('staging');
            expect(mockedInquirer.prompt).toHaveBeenCalledTimes(2);
        });
    });

    it('should prompt for function to run', async () => {
        mockedInquirer.prompt.mockResolvedValue({ func: 'my-sync' });
        const functions = [{ name: 'my-sync', type: 'sync' }];
        const name = await promptForFunctionToRun(functions);
        expect(name).toBe('my-sync');
        expect(mockedInquirer.prompt).toHaveBeenCalledWith([
            {
                type: 'rawlist',
                name: 'func',
                message: expect.any(String),
                choices: [{ name: 'my-sync (sync)', value: 'my-sync' }]
            }
        ]);
    });

    it('should prompt for project path', async () => {
        mockedInquirer.prompt.mockResolvedValue({ pathInput: 'my-project' });
        const path = await promptForProjectPath();
        expect(path).toBe('my-project');
        expect(mockedInquirer.prompt).toHaveBeenCalledWith([
            {
                type: 'input',
                name: 'pathInput',
                message: expect.any(String),
                default: 'nango-integrations'
            }
        ]);
    });

    describe('promptForConnection', () => {
        it('should prompt for connection and return the connection ID', async () => {
            const mockConnections = {
                connections: [
                    { provider: 'hubspot', connection_id: 'conn1' },
                    { provider: 'salesforce', connection_id: 'conn2' }
                ]
            };
            listConnectionsMock.mockResolvedValue(mockConnections);

            mockedInquirer.prompt.mockResolvedValue({ connection: 'conn1' });
            const connectionId = await promptForConnection('dev');

            expect(connectionId).toBe('conn1');
            expect(mockedParseSecretKey).toHaveBeenCalledTimes(1);
            expect(mockedInquirer.prompt).toHaveBeenCalledWith([
                {
                    type: 'rawlist',
                    name: 'connection',
                    message: expect.any(String),
                    choices: [
                        { name: 'hubspot - conn1', value: 'conn1' },
                        { name: 'salesforce - conn2', value: 'conn2' }
                    ]
                }
            ]);
        });

        it('should throw an error if no connections are found', async () => {
            const mockConnections = { connections: [] };
            listConnectionsMock.mockResolvedValue(mockConnections);

            await expect(promptForConnection('dev')).rejects.toThrow(
                'No connections found in your project for the selected environment. Please create a connection first.'
            );
        });

        it('should throw an error if fetching connections fails', async () => {
            listConnectionsMock.mockRejectedValue(new Error('API error'));

            await expect(promptForConnection('dev')).rejects.toThrow('API error');
        });
    });
});
