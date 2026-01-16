import {
    promptForConnection,
    promptForEnvironment,
    promptForFunctionName,
    promptForFunctionToRun,
    promptForFunctionType,
    promptForIntegrationName,
    promptForProjectPath
} from './interactive.service.js';
import { MissingArgumentError } from '../utils/errors.js';

import type { FunctionType } from '../types.js';

export class Ensure {
    constructor(private readonly interactive: boolean) {}

    private async ensure<T>(currentValue: T | undefined, promptFn: () => Promise<T>, errorMessage: string): Promise<T> {
        if (currentValue) {
            return currentValue;
        }
        if (!this.interactive) {
            throw new MissingArgumentError(errorMessage);
        }
        try {
            return await promptFn();
        } catch (err: any) {
            if (err.isTtyError) {
                throw new Error(
                    "Prompt couldn't be rendered in the current environment. Please use the --no-interactive flag and pass all required arguments."
                );
            }
            if (err.name === 'ExitPromptError') {
                console.log('Interactive prompt cancelled.');
                process.exit(0);
            }
            throw err;
        }
    }

    public async functionType(sync: boolean, action: boolean, onEvent: boolean): Promise<FunctionType> {
        if (sync) return 'sync';
        if (action) return 'action';
        if (onEvent) return 'on-event';

        if (!this.interactive) {
            throw new MissingArgumentError('Must specify --sync, --action, or --on-event');
        }

        return await this.ensure(undefined, promptForFunctionType, 'Function type is required');
    }

    public async integration(current: string | undefined, context: { integrations: string[] }): Promise<string> {
        return this.ensure(current, () => promptForIntegrationName(context), 'Integration name is required');
    }

    public async functionName(current: string | undefined, functionType: FunctionType): Promise<string> {
        return this.ensure(current, () => promptForFunctionName(functionType), 'Function name is required');
    }

    public async environment(current: string | undefined): Promise<string> {
        return this.ensure(current, () => promptForEnvironment(), 'Environment is required');
    }

    public async function(current: string | undefined, availableFunctions: { name: string; type: string }[]): Promise<string> {
        return this.ensure(current, () => promptForFunctionToRun(availableFunctions), 'Function name is required');
    }

    public async connection(current: string | undefined, environment: string): Promise<string> {
        return this.ensure(current, () => promptForConnection(environment), 'Connection ID is required');
    }

    public async projectPath(current: string | undefined): Promise<string> {
        return this.ensure(current, () => promptForProjectPath(), 'Project path is required');
    }
}
