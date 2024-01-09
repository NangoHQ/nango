import { LocalRunner } from './local.runner.js';
import { RenderRunner } from './render.runner.js';
import { getEnv, LogActionEnum, metricsManager, MetricTypes } from '@nangohq/shared';

export function getRunnerId(suffix: string): string {
    return `${getEnv()}-runner-account-${suffix}`;
}

export async function getOrStartRunner(runnerId: string): Promise<Runner> {
    const isRender = process.env['IS_RENDER'] === 'true';
    try {
        const runner = isRender ? await RenderRunner.getOrStart(runnerId) : await LocalRunner.getOrStart(runnerId);

        // Wait for runner to start and be healthy
        const timeoutMs = 5000;
        let healthCheck = false;
        const startTime = Date.now();
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
    } catch (e) {
        await metricsManager.capture(
            MetricTypes.RENDER_RUNNER_FAILURE_RESOLVED_BACK_TO_LOCAL,
            'Render runner cannnot be accessed',
            LogActionEnum.INFRASTRUCTURE,
            {
                runnerId: String(runnerId),
                error: String(e)
            }
        );

        return await LocalRunner.getOrStart(runnerId);
    }
}

export interface Runner {
    id: string;
    client: any;
    suspend(): Promise<void>;
}

export async function suspendRunner(runnerId: string): Promise<void> {
    const isRender = process.env['IS_RENDER'] === 'true';
    if (isRender) {
        // we only suspend render runners
        const runner = await RenderRunner.get(runnerId);
        if (runner) {
            await runner.suspend();
        }
    }
}
