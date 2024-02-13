import type { Runner } from './runner.js';
import { RunnerType } from './runner.js';
import { execSync, spawn, ChildProcess } from 'child_process';
import { getRunnerClient } from '@nangohq/nango-runner';

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

    async suspend(): Promise<void> {
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
            } catch (err) {
                throw new Error('Unable to find node');
            }

            const nangoRunnerPath = process.env['NANGO_RUNNER_PATH'] || '../runner/dist/app.js';

            const cmd = nodePath;
            const runnerLocation = `${nangoRunnerPath}`;
            const cmdOptions = [runnerLocation, port.toString(), runnerId];
            console.log(`[Runner] Starting runner with command: ${cmd} ${cmdOptions.join(' ')} `);

            const childProcess = spawn(cmd, cmdOptions, {
                stdio: [null, null, null]
            });

            if (!childProcess) {
                throw new Error('Unable to spawn runner process');
            }

            if (childProcess.stdout) {
                childProcess.stdout.on('data', (data) => {
                    console.log(`[Runner] ${data.toString()} `);
                });
            }

            if (childProcess.stderr) {
                childProcess.stderr.on('data', (data) => {
                    console.log(`[Runner][ERROR] ${data.toString()} `);
                });
            }

            return new LocalRunner(runnerId, `http://localhost:${port}`, childProcess);
        } catch (err) {
            throw new Error(`Unable to get runner ${runnerId}: ${err}`);
        }
    }
}
