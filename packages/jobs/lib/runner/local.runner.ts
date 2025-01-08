import getPort, { portNumbers } from 'get-port';
import type { Runner } from './runner.js';
import { RunnerType } from './runner.js';
import { execSync, spawn } from 'child_process';
import { getRunnerClient } from '@nangohq/nango-runner';
import { getLogger, stringifyError } from '@nangohq/utils';
import { getProvidersUrl } from '@nangohq/shared';
import { envs } from '../env.js';

const logger = getLogger('Jobs');

export class LocalRunner implements Runner {
    public client: any;
    public runnerType: RunnerType = RunnerType.Local;
    constructor(
        public readonly id: string,
        public readonly url: string,
        public readonly pid: number | undefined
    ) {
        this.client = getRunnerClient(this.url);
    }

    suspend() {
        if (this.pid) {
            process.kill(this.pid, 'SIGTERM');
        }
    }

    toJSON() {
        return { runnerType: this.runnerType, id: this.id, url: this.url };
    }

    static fromJSON(obj: any): LocalRunner {
        return new LocalRunner(obj.id, obj.url, obj.pid);
    }

    static async getOrStart(runnerId: string): Promise<LocalRunner> {
        try {
            const port = await getPort({ port: portNumbers(11000, 12000) });
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
                    IDLE_MAX_DURATION_MS: '0',
                    PROVIDERS_URL: getProvidersUrl(),
                    PROVIDERS_RELOAD_INTERVAL: envs.PROVIDERS_RELOAD_INTERVAL.toString()
                }
            });

            if (!childProcess) {
                throw new Error('Unable to spawn runner process');
            }

            if (childProcess.stdout) {
                childProcess.stdout.on('data', (data) => {
                    // used on purpose to not append jobs formatting to runner
                    // eslint-disable-next-line no-console
                    console.log(`[Runner] ${data.toString().slice(0, -1)} `);
                });
            }

            if (childProcess.stderr) {
                childProcess.stderr.on('data', (data) => {
                    // used on purpose to not append jobs formatting to runner
                    // eslint-disable-next-line no-console
                    console.error(`[Runner][ERROR] ${data.toString().slice(0, -1)} `);
                });
            }

            return await Promise.resolve(new LocalRunner(runnerId, `http://localhost:${port}`, childProcess.pid));
        } catch (err) {
            throw new Error(`Unable to get runner ${runnerId}: ${stringifyError(err)}`);
        }
    }
}
