import { spawn } from 'node:child_process';

const startedAt = Date.now();
const callbackUrl = requiredEnv('NANGO_DRYRUN_CALLBACK_URL');
const token = requiredEnv('NANGO_SECRET_KEY');
const dryrunArgs = JSON.parse(requiredEnv('NANGO_DRYRUN_ARGS'));
const compileTimeoutMs = Number(requiredEnv('NANGO_DRYRUN_COMPILE_TIMEOUT_MS'));
const dryrunTimeoutMs = Number(requiredEnv('NANGO_DRYRUN_TIMEOUT_MS'));
const compileExitCode = Number(requiredEnv('NANGO_DRYRUN_COMPILE_EXIT_CODE'));

try {
    const compile = await runCommand('nango', ['compile'], { timeoutMs: compileTimeoutMs });
    if (compile.timedOut) {
        await postResult({ status: 'failed', output: commandOutput(compile), error: { code: 'timeout', message: 'Compilation timed out' } });
        process.exit(1);
    }
    if (compile.exitCode !== 0) {
        const output = commandOutput(compile);
        await postResult({ status: 'failed', output, error: { code: 'compilation_error', message: output || 'Compilation failed' } });
        process.exit(1);
    }

    const dryrun = await runCommand('nango', dryrunArgs, { timeoutMs: dryrunTimeoutMs });
    if (dryrun.timedOut) {
        await postResult({ status: 'failed', output: commandOutput(dryrun), error: { code: 'timeout', message: 'Dry run timed out' } });
        process.exit(1);
    }
    if (dryrun.exitCode !== 0) {
        const output = commandOutput(dryrun);
        await postResult({
            status: 'failed',
            output,
            error: {
                code: dryrun.exitCode === compileExitCode ? 'compilation_error' : 'dryrun_error',
                message: output || 'Dry run failed'
            }
        });
        process.exit(1);
    }

    await postResult({ status: 'success', output: dryrun.stdout.trimEnd() });
    process.exit(0);
} catch (err) {
    await postResult({ status: 'failed', error: { code: 'dryrun_error', message: err instanceof Error ? err.message : String(err) } }).catch(() => undefined);
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
