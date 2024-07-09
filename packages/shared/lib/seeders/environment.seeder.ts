import type { DBEnvironment } from '@nangohq/types';
import environmentService from '../services/environment.service.js';

export async function createEnvironmentSeed(accountId: number = 0, envName: string = 'test'): Promise<DBEnvironment> {
    const env = await environmentService.createEnvironment(accountId, envName);
    if (!env) {
        throw new Error('Failed to create environment');
    }
    return env;
}
