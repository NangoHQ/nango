import type { Environment } from '../../models/Environment.js';
import environmentService from '../../services/environment.service.js';

export async function createEnvironmentSeed(envName: string = 'test'): Promise<Environment> {
    const env = await environmentService.createEnvironment(0, envName);
    if (!env) {
        throw new Error('Failed to create environment');
    }
    return env;
}
