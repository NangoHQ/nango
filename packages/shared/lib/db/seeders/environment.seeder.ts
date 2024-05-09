import type { Environment } from '../../models/Environment.js';
import environmentService from '../../services/environment.service.js';

export async function createEnvironmentSeed(accountId: number = 0, envName: string = 'test'): Promise<Environment> {
    const env = await environmentService.createEnvironment(accountId, envName);
    if (!env) {
        throw new Error('Failed to create environment');
    }
    return env;
}
