import { LocalRunner } from './local.runner.js';
import { RenderRunner } from './render.runner.js';
import { getEnv } from '@nangohq/shared';

export function getRunnerId(suffix: string): string {
    return `${getEnv()}-runner-account-${suffix}`;
}

export async function getRunner(runnerId: string): Promise<Runner> {
    const isRender = process.env['IS_RENDER'] === 'true';
    const runner = isRender ? await RenderRunner.get(runnerId) : await LocalRunner.get(runnerId);

    // Wait for runner to start and be healthy
    const timeoutMs = 5000;
    let healthCheck = false;
    let startTime = Date.now();
    while (!healthCheck && Date.now() - startTime < timeoutMs) {
        try {
            await runner.client.health.query();
            healthCheck = true;
        } catch (err) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    if (!healthCheck) {
        throw new Error(`Runner '${runnerId}' hasn't started after ${timeoutMs}ms,`);
    }
    return runner;
}

export interface Runner {
    id: string;
    client: any;
    stop(): Promise<void>;
}
