import { getRunnerClient } from '@nangohq/nango-runner';

import { envs } from '../env.js';
import { runnerHttpOpts, RunnerType } from './runner.js';

import type { Runner } from './runner.js';

export class RemoteRunner implements Runner {
    public client: any;
    public runnerType: RunnerType = RunnerType.Remote;
    constructor(
        public readonly id: string,
        public readonly url: string,
        token?: string | null
    ) {
        this.client = getRunnerClient(this.url, runnerHttpOpts, { token });
    }

    static async getOrStart(runnerId: string, token?: string | null): Promise<RemoteRunner> {
        return Promise.resolve(new RemoteRunner(runnerId, envs.RUNNER_SERVICE_URL || 'http://nango-runner', token));
    }
}
