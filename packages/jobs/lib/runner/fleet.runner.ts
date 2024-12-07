import type { Runner } from './runner.js';
import { RunnerType } from './runner.js';
import { getRunnerClient } from '@nangohq/nango-runner';

export class FleetRunner implements Runner {
    public client: any;
    public runnerType: RunnerType = RunnerType.Fleet;
    constructor(
        public readonly id: string,
        public readonly url: string
    ) {
        this.client = getRunnerClient(this.url);
    }

    // TODO: DEPRECATE
    suspend() {}
    toJSON() {
        return {};
    }
    static fromJSON(obj: any): FleetRunner {
        throw new Error(`'fromJSON(${obj})' not implemented`);
    }
}
