import { spawn } from 'node:child_process';

const startedAt = Date.now();
const callbackUrl = requiredEnv('NANGO_DEPLOY_CALLBACK_URL');
const token = requiredEnv('NANGO_SECRET_KEY');
const deployArgs = JSON.parse(requiredEnv('NANGO_DEPLOY_ARGS'));
const deployTimeoutMs = Number(requiredEnv('NANGO_DEPLOY_TIMEOUT_MS'));
const compileExitCode = Number(requiredEnv('NANGO_DEPLOY_COMPILE_EXIT_CODE'));

try {
    const deploy = await runCommand('nango', deployArgs, { timeoutMs: deployTimeoutMs });
    if (deploy.timedOut) {
        await postResult({ status: 'failed', output: commandOutput(deploy), error: { code: 'timeout', message: 'Deployment timed out' } });
        process.exit(1);
    }
    if (deploy.exitCode !== 0) {
        const output = commandOutput(deploy);
        await postResult({
            status: 'failed',
            output,
            error: {
                code: deploy.exitCode === compileExitCode ? 'compilation_error' : 'deployment_error',
                message: output || 'Deployment failed'
            }
        });
        process.exit(1);
    }

    await postResult({ status: 'success', output: deploy.stdout.trimEnd() });
    process.exit(0);
} catch (err) {
    await postResult({ status: 'failed', error: { code: 'deployment_error', message: err instanceof Error ? err.message : String(err) } }).catch(
        () => undefined
    );
    process.exit(1);
}

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error('Missing ' + name);
    }
    return value;
}

function runCommand(command, args, { timeoutMs }) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, timeoutMs);

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (exitCode) => {
            clearTimeout(timer);
            resolve({ exitCode, stdout, stderr, timedOut });
        });
    });
}

async function postResult(payload) {
    const body = JSON.stringify({ ...payload, duration_ms: Date.now() - startedAt });
    let lastError;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const res = await fetch(callbackUrl, {
                method: 'POST',
                headers: {
                    authorization: 'Bearer ' + token,
                    'content-type': 'application/json',
                    'Nango-Is-Script': 'true'
                },
                body
            });
            if (res.ok) {
                return;
            }
            lastError = new Error('Callback failed with status ' + res.status);
        } catch (err) {
            lastError = err;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    throw lastError;
}

function commandOutput({ stdout, stderr }) {
    return [stdout, stderr]
        .map((value) => value.trimEnd())
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .join('\n');
}
