import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const port = 8080;
const host = '0.0.0.0';
const workspacePath = '/home/user/nango-integrations';
const heartbeatIntervalMs = 5_000;

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
        const statusCode = req.method === 'POST' && req.url === '/invocations' ? 200 : 500;
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
        env: { ...process.env, ...(payload.envs ?? {}) },
        stdio: 'ignore'
    });
    activeCommand = child;
    touch();

    const timeout = Number(payload.timeoutMs);
    const timeoutHandle =
        Number.isFinite(timeout) && timeout > 0
            ? setTimeout(() => {
                  child.kill('SIGTERM');
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

function resolvePath(value) {
    if (!value || value === '.') {
        return workspacePath;
    }

    return path.isAbsolute(value) ? value : path.join(workspacePath, value);
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
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
