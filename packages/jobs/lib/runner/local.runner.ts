import type { Runner } from './runner.js';
import { RunnerType } from './runner.js';
import type { ChildProcess } from 'child_process';
import { execSync, spawn } from 'child_process';
import { getRunnerClient } from '@nangohq/nango-runner';
import { getLogger } from '@nangohq/utils';

const logger = getLogger('Jobs');

export class LocalRunner implements Runner {
    public client: any;
    public runnerType: RunnerType = RunnerType.Local;
    constructor(
        public readonly id: string,
        public readonly url: string,
        private readonly childProcess: ChildProcess
    ) {
        this.client = getRunnerClient(this.url);
    }

    suspend() {
        this.childProcess.kill();
    }
    toJSON() {
        return { runnerType: this.runnerType, id: this.id, url: this.url };
    }

    static fromJSON(obj: any): LocalRunner {
        throw new Error(`'fromJSON(${obj})' not implemented`);
    }

    static async getOrStart(runnerId: string): Promise<LocalRunner> {
        try {
            const port = Math.floor(Math.random() * 1000) + 11000; // random port between 11000 and 12000;
            let nodePath = '';
            try {
                nodePath = execSync('which node', { encoding: 'utf-8' }).trim();
            } catch {
                throw new Error('Unable to find node');
            }

            const nangoRunnerPath = process.env['NANGO_RUNNER_PATH'] || '../runner/dist/app.js';

            const cmd = nodePath;
            const runnerLocation = nangoRunnerPath;
            const cmdOptions = [runnerLocation, port.toString(), runnerId];
            logger.info(`[Runner] Starting runner with command: ${cmd} ${cmdOptions.join(' ')} `);

            const childProcess = spawn(cmd, cmdOptions, {
                stdio: [null, null, null],
                env: {
                    ...process.env,
                    RUNNER_ID: runnerId,
                    IDLE_MAX_DURATION_MS: '0'
                }
            });

            if (!childProcess) {
                throw new Error('Unable to spawn runner process');
            }

            if (childProcess.stdout) {
                childProcess.stdout.on('data', (data) => {
                    logger.info(`[Runner] ${data.toString()} `);
                });
            }

            if (childProcess.stderr) {
                childProcess.stderr.on('data', (data) => {
                    logger.info(`[Runner][ERROR] ${data.toString()} `);
                });
            }

            return new LocalRunner(runnerId, `http://localhost:${port}`, childProcess);
        } catch (err) {
            throw new Error(`Unable to get runner ${runnerId}: ${err}`);
        }
    }
}
