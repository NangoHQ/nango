import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const ENV_PATH = resolve(homedir(), 'nango/clickhouse_perf/.env');

function loadEnv() {
    const text = readFileSync(ENV_PATH, 'utf8');
    const out = {};
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const i = trimmed.indexOf('=');
        if (i < 0) continue;
        const k = trimmed.slice(0, i).trim();
        let v = trimmed.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        out[k] = v;
    }
    return out;
}

const env = loadEnv();
for (const k of ['HOST', 'USER', 'PASSWORD']) {
    if (!env[k]) {
        throw new Error(`Missing ${k} in ${ENV_PATH}`);
    }
}

const baseUrl = `https://${env.HOST}/`;
const auth = 'Basic ' + Buffer.from(`${env.USER}:${env.PASSWORD}`).toString('base64');

export const HOST = env.HOST;

/**
 * Run a ClickHouse SQL query via the HTTP interface.
 * Returns { rows, status, durationMs, queryId }.
 * Rows are parsed JSONEachRow objects.
 */
export async function query(sql, opts = {}) {
    const params = new URLSearchParams();
    params.set('default_format', 'JSONEachRow');
    if (opts.queryId) params.set('query_id', opts.queryId);

    const t0 = Date.now();
    const res = await fetch(`${baseUrl}?${params.toString()}`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'text/plain' },
        body: sql
    });
    const text = await res.text();
    const durationMs = Date.now() - t0;

    if (!res.ok) {
        // Strip any echoed query body just to keep the log compact; never include auth header.
        throw new Error(`ClickHouse HTTP ${res.status}: ${text.slice(0, 800)}`);
    }

    const rows = text
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l));

    return {
        rows,
        status: res.status,
        durationMs,
        queryId: res.headers.get('x-clickhouse-query-id') ?? null
    };
}
