import { getLogger } from '@nangohq/utils';
import type { Runner } from './runner.js';
import { RunnerType } from './runner.js';
import { getRunnerClient } from '@nangohq/nango-runner';

const logger = getLogger('Jobs');

export class RemoteRunner implements Runner {
    public client: any;
    public runnerType: RunnerType = RunnerType.Remote;
    constructor(
        public readonly id: string,
        public readonly url: string
    ) {
        this.client = getRunnerClient(this.url);
    }

    suspend() {
        logger.warn('cannot suspend a remote runner');
    }

    toJSON() {
        return { runnerType: this.runnerType, id: this.id, url: this.url };
    }

    static fromJSON(obj: any): RemoteRunner {
        throw new Error(`'fromJSON(${obj})' not implemented`);
    }

    static async getOrStart(runnerId: string): Promise<RemoteRunner> {
        return new RemoteRunner(runnerId, process.env['RUNNER_SERVICE_URL'] || 'http://nango-runner');
    }
}
