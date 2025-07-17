import { getRunnerClient } from '@nangohq/nango-runner';

import { RunnerType } from './runner.js';

import type { Runner } from './runner.js';

export class FleetRunner implements Runner {
    public client: any;
    public runnerType: RunnerType = RunnerType.Fleet;
    constructor(
        public readonly id: string,
        public readonly url: string
    ) {
        this.client = getRunnerClient(this.url);
    }
}
