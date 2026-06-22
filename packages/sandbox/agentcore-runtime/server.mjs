import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const port = 8080;
const host = '0.0.0.0';
const workspacePath = '/home/user/nango-integrations';
const heartbeatIntervalMs = 5_000;
const commandEnvAllowlist = ['PATH', 'HOME', 'NANGO_CLI_UPGRADE_MODE', 'NODE_ENV'];
const maxInvocationBodyBytes = 10 * 1024 * 1024;

let activeCommand = null;
let timeOfLastUpdate = unixNow();

setInterval(() => {
    if (activeCommand) {
        touch();
    }
}, heartbeatIntervalMs).unref();

const server = http.createServer(async (req, res) => {
    try {
        // AgentCore calls /ping to monitor runtime health. While a background
        // command runs, keep time_of_last_update fresh and report HealthyBusy.
        if (req.method === 'GET' && req.url === '/ping') {
            sendJson(res, 200, {
                status: activeCommand ? 'HealthyBusy' : 'Healthy',
                time_of_last_update: timeOfLastUpdate
            });
            return;
        }

        // AgentCore invokes HTTP runtimes through /invocations. We use this
        // adapter for operations that do not fit the direct command API well:
        // init, file writes/reads, and starting background commands.
        if (req.method === 'POST' && req.url === '/invocations') {
            const payload = JSON.parse(await readRequestBody(req));
            const data = await handleInvocation(payload);
            sendJson(res, 200, { ok: true, data });
            return;
        }

        sendJson(res, 404, { ok: false, error: { message: 'Not found' } });
    } catch (err) {
        const statusCode = getErrorStatusCode(err) ?? (req.method === 'POST' && req.url === '/invocations' ? 200 : 500);
        sendJson(res, statusCode, { ok: false, error: serializeError(err) });
    }
});

server.listen(port, host, () => {
    console.log(`AgentCore sandbox adapter listening on ${host}:${port}`);
});

async function handleInvocation(payload) {
    switch (payload?.operation) {
        case 'init':
            return { workspacePath };
        case 'writeFiles':
            await writeFiles(payload.files);
            return undefined;
        case 'readTextFile':
            return await fs.readFile(resolvePath(payload.path), 'utf8');
        case 'startCommand':
            startCommand(payload);
            return undefined;
        default:
            throw new Error(`Unsupported operation: ${String(payload?.operation)}`);
    }
}

async function writeFiles(files) {
    if (!Array.isArray(files)) {
        throw new Error('writeFiles requires files');
    }

    for (const file of files) {
        const filePath = resolvePath(file.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.contents ?? '', 'utf8');
    }
}

function startCommand(payload) {
    if (!payload.command || typeof payload.command !== 'string') {
        throw new Error('startCommand requires command');
    }

    if (activeCommand) {
        throw new Error('A command is already running in this runtime session');
    }

    const child = spawn('sh', ['-lc', payload.command], {
        cwd: workspacePath,
        detached: true,
        env: buildCommandEnv(payload.envs),
        stdio: 'ignore'
    });
    activeCommand = child;
    touch();

    const timeout = Number(payload.timeoutMs);
    const timeoutHandle =
        Number.isFinite(timeout) && timeout > 0
            ? setTimeout(() => {
                  terminateCommand(child);
              }, timeout).unref()
            : undefined;

    const finish = () => {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
        if (activeCommand === child) {
            activeCommand = null;
        }
        touch();
    };

    child.once('exit', finish);
    child.once('error', finish);

    // Let the command continue as a detached background job after this HTTP
    // request returns; the server process itself remains alive for callbacks.
    child.unref();
}

function buildCommandEnv(overrides = {}) {
    const inherited = Object.fromEntries(
        commandEnvAllowlist.flatMap((name) => {
            const value = process.env[name];
            return value === undefined ? [] : [[name, value]];
        })
    );

    // Only inherit runtime variables needed to locate and run the CLI. Nango
    // secrets and command inputs must come from the explicit invocation envs.
    return { ...inherited, ...overrides };
}

function terminateCommand(child) {
    if (!child.pid) {
        child.kill('SIGTERM');
        return;
    }

    try {
        // `detached: true` makes the child the leader of a new process group.
        // A negative pid targets that whole group, so timeouts stop the shell
        // and any nested command it started.
        process.kill(-child.pid, 'SIGTERM');
    } catch (err) {
        if (err?.code === 'ESRCH') {
            return;
        }

        console.error('Failed to terminate command process group', err);
        child.kill('SIGTERM');
    }
}

function resolvePath(value) {
    if (!value || value === '.') {
        return workspacePath;
    }

    if (path.isAbsolute(value)) {
        throw new Error('Sandbox paths must be relative to the workspace');
    }

    const resolvedPath = path.resolve(workspacePath, value);
    const relativePath = path.relative(workspacePath, resolvedPath);
    if (relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))) {
        return resolvedPath;
    }

    throw new Error('Sandbox paths must stay within the workspace');
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        const contentLength = Number(req.headers['content-length']);
        if (Number.isFinite(contentLength) && contentLength > maxInvocationBodyBytes) {
            req.resume();
            reject(invocationBodyTooLargeError());
            return;
        }

        const chunks = [];
        let totalBytes = 0;
        let done = false;

        req.on('data', (chunk) => {
            if (done) {
                return;
            }

            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            totalBytes += buffer.byteLength;
            if (totalBytes > maxInvocationBodyBytes) {
                done = true;
                req.removeAllListeners('data');
                req.resume();
                reject(invocationBodyTooLargeError());
                return;
            }

            chunks.push(buffer);
        });
        req.on('end', () => {
            if (done) {
                return;
            }

            done = true;
            resolve(Buffer.concat(chunks).toString('utf8'));
        });
        req.on('error', (err) => {
            if (done) {
                return;
            }

            done = true;
            reject(err);
        });
    });
}

function invocationBodyTooLargeError() {
    const err = new Error(`Invocation body exceeds ${maxInvocationBodyBytes} bytes`);
    err.statusCode = 413;
    return err;
}

function getErrorStatusCode(err) {
    if (err && typeof err === 'object' && Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode <= 599) {
        return err.statusCode;
    }

    return undefined;
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
}

function serializeError(err) {
    if (err instanceof Error) {
        return { name: err.name, message: err.message };
    }

    return { message: String(err) };
}

function touch() {
    timeOfLastUpdate = unixNow();
}

function unixNow() {
    return Math.floor(Date.now() / 1000);
}
