import getPort, { portNumbers } from 'get-port';
import type { NodeProvider } from '@nangohq/fleet';
import { spawn } from 'child_process';
import { logger } from '../logger.js';
import { envs } from '../env.js';
import type { Result } from '@nangohq/utils';
import { Err, Ok, stringifyError } from '@nangohq/utils';
import { getProvidersUrl } from '@nangohq/shared';

const localRunnerPids = new Map<number, number>(); // Mapping Node.id to process PID

export const localNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        // irrelevant for local runner
        image: 'my-image',
        cpuMilli: 500,
        memoryMb: 512,
        storageMb: 20000
    },
    start: async (node) => {
        try {
            // Random port to avoid conflicts with other fleet runners accross local execution
            const rndPort = Math.floor(Math.random() * 10000) + 10000;
            const port = await getPort({ port: portNumbers(rndPort, rndPort + 100) });

            const cmd = process.argv[0]!;
            const runnerLocation = process.env['NANGO_RUNNER_PATH'] || '../runner/dist/app.js';
            const cmdOptions = [runnerLocation, port.toString(), node.id.toString()];

            logger.info(`[Runner] Starting runner with command: ${cmd} ${cmdOptions.join(' ')} `);

            const childProcess = spawn(cmd, cmdOptions, {
                stdio: [null, null, null],
                env: {
                    ...process.env,
                    RUNNER_NODE_ID: node.id.toString(),
                    RUNNER_URL: `http://localhost:${port}`,
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
    },
    verifyUrl: (url) => {
        const res: Result<void> = url.startsWith('http://localhost:')
            ? Ok(undefined)
            : Err(new Error(`Local runner url should start with http://localhost, got ${url}`));
        return Promise.resolve(res);
    }
};
