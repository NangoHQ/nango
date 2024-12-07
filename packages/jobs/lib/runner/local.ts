import getPort, { portNumbers } from 'get-port';
import type { NodeProvider } from '@nangohq/fleet';
import { execSync, spawn } from 'child_process';
import { logger } from '../logger.js';
import { envs } from '../env.js';
import { Err, Ok, stringifyError } from '@nangohq/utils';
import { getProvidersUrl } from '@nangohq/shared';

const localRunnerPids = new Map<number, number>(); // Mapping Node.id to process PID

export const localNodeProvider: NodeProvider = {
    start: async (node) => {
        try {
            // Random port to avoid conflicts with other fleet runners accross local execution
            const rndPort = Math.floor(Math.random() * 10000) + 10000;
            const port = await getPort({ port: portNumbers(rndPort, rndPort + 100) });
            let nodePath = '';
            try {
                nodePath = execSync('which node', { encoding: 'utf-8' }).trim();
            } catch {
                throw new Error('Unable to find node');
            }

            const nangoRunnerPath = process.env['NANGO_RUNNER_PATH'] || '../runner/dist/app.js';

            const cmd = nodePath;
            const runnerLocation = nangoRunnerPath;
            const cmdOptions = [runnerLocation, port.toString(), node.id.toString()];

            logger.info(`[Runner] Starting runner with command: ${cmd} ${cmdOptions.join(' ')} `);

            const childProcess = spawn(cmd, cmdOptions, {
                stdio: [null, null, null],
                env: {
                    ...process.env,
                    RUNNER_NODE_ID: node.id.toString(),
                    IDLE_MAX_DURATION_MS: '0',
                    PROVIDERS_URL: getProvidersUrl(),
                    PROVIDERS_RELOAD_INTERVAL: envs.PROVIDERS_RELOAD_INTERVAL.toString(),
                    RUNNER_TYPE: 'LOCAL'
                }
            });

            if (!childProcess || !childProcess.pid) {
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
            localRunnerPids.set(node.id, childProcess.pid);
            return Ok(undefined);
        } catch (err) {
            return Err(new Error(`Unable to start local runner ${node.id}: ${stringifyError(err)}`));
        }
    },
    terminate: (node) => {
        const pid = localRunnerPids.get(node.id);
        if (pid) {
            try {
                process.kill(pid);
                localRunnerPids.delete(node.id);
            } catch {
                // doing nothing: the process is already dead
            }
        }
        return Promise.resolve(Ok(undefined));
    }
};
