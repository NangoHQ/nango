import { getRunnerClient } from '@nangohq/nango-runner';

import { RunnerType } from './runner.js';

import type { Runner } from './runner.js';

export class RemoteRunner implements Runner {
    public client: any;
    public runnerType: RunnerType = RunnerType.Remote;
    constructor(
        public readonly id: string,
        public readonly url: string
    ) {
        this.client = getRunnerClient(this.url);
    }

    static async getOrStart(runnerId: string): Promise<RemoteRunner> {
        return Promise.resolve(new RemoteRunner(runnerId, process.env['RUNNER_SERVICE_URL'] || 'http://nango-runner'));
    }
}
