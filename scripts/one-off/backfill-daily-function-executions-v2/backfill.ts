import { createClient } from '@clickhouse/client';

import { isValidUtcDay } from './date.js';
import { deleteSql, insertSql, segmentASelectSql, segmentBSelectSql, verificationQueries } from './sql.js';
import { assertSafeClickhouseUrl } from './url.js';

import type { ClickHouseClient } from '@clickhouse/client';

type Options = {
    database: string;
    deployedOn: string;
    dryRun: boolean;
    allowRemote: boolean;
    from?: string;
    to?: string;
};

const USAGE = `Usage: npm run <dry-run|run> -- --deployed-on YYYY-MM-DD [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--database usage] [--allow-remote]

Rebuilds closed v2 function-execution days. Run after 01:00 UTC.`;

function dateString(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function addUtcDays(day: string, days: number): string {
    const date = new Date(`${day}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return dateString(date);
}

function assertDay(value: string, option: string): string {
    if (!isValidUtcDay(value)) {
        throw new Error(`${option} must be an ISO UTC date (YYYY-MM-DD), received ${value}`);
    }
    return value;
}

function parseOptions(argv: string[]): Options {
    const values = new Map<string, string>();
    let dryRun = false;
    let allowRemote = false;

    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index]!;
        if (argument === '--dry-run') {
            dryRun = true;
            continue;
        }
        if (argument === '--allow-remote') {
            allowRemote = true;
            continue;
        }
        if (argument === '--help' || argument === '-h') {
            console.log(USAGE);
            process.exit(0);
        }
        if (!['--database', '--deployed-on', '--from', '--to'].includes(argument)) {
            throw new Error(`Unknown argument: ${argument}`);
        }
        const value = argv[++index];
        if (!value || value.startsWith('--')) {
            throw new Error(`${argument} requires a value`);
        }
        values.set(argument, value);
    }

    const deployedOn = values.get('--deployed-on');
    if (!deployedOn) {
        throw new Error('Missing required --deployed-on YYYY-MM-DD argument');
    }

    const database = values.get('--database') ?? 'usage';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
        throw new Error(`--database must be a ClickHouse identifier, received ${database}`);
    }

    return {
        database,
        deployedOn: assertDay(deployedOn, '--deployed-on'),
        dryRun,
        allowRemote,
        ...(values.has('--from') ? { from: assertDay(values.get('--from')!, '--from') } : {}),
        ...(values.has('--to') ? { to: assertDay(values.get('--to')!, '--to') } : {})
    };
}

async function scalarDay(client: ClickHouseClient, sql: string): Promise<string | null> {
    const result = await client.query({ query: sql, format: 'JSONEachRow' });
    const rows = await result.json<{ day: string | null }>();
    return rows[0]?.day ?? null;
}

async function selectedRowCount(client: ClickHouseClient, selectSql: string): Promise<number> {
    const result = await client.query({ query: `SELECT count() AS count FROM (${selectSql})`, format: 'JSONEachRow' });
    const rows = await result.json<{ count: string }>();
    return Number(rows[0]?.count ?? 0);
}

async function run(options: Options): Promise<void> {
    const url = process.env['CLICKHOUSE_URL'];
    if (!url) throw new Error('CLICKHOUSE_URL is not set');
    assertSafeClickhouseUrl(url, options.allowRemote);

    const client = createClient({ url, database: options.database, request_timeout: 60_000 });
    try {
        const today = dateString(new Date());
        let lastDay = addUtcDays(today, -1);
        if (lastDay < options.deployedOn) {
            throw new Error(`Refusing to run: D_last (${lastDay}) is before D0 (${options.deployedOn})`);
        }
        if (new Date().getUTCHours() < 1 && (!options.to || options.to >= lastDay)) {
            console.log(`Skipping open-risk day ${lastDay}: it is before 01:00 UTC.`);
            lastDay = addUtcDays(lastDay, -1);
        }

        const rawFloor = await scalarDay(
            client,
            `SELECT minOrNull(toDate(ts)) AS day FROM ${options.database}.raw_events WHERE type = 'usage.function_executions'`
        );
        const v1Floor = await scalarDay(client, `SELECT minOrNull(day) AS day FROM ${options.database}.daily_function_executions`);
        if (!rawFloor || !v1Floor) throw new Error('Cannot determine raw_events or v1 history floor');

        const from = options.from ?? v1Floor;
        const to = options.to ?? lastDay;
        if (from > to) throw new Error(`Invalid range: --from (${from}) is after --to (${to})`);
        if (to > lastDay) throw new Error(`--to (${to}) must not be after D_last (${lastDay})`);

        console.log(`Backfilling ${from} through ${to}; D_min=${rawFloor}, D0=${options.deployedOn}${options.dryRun ? ' (dry run)' : ''}`);
        for (let day = from; day <= to; day = addUtcDays(day, 1)) {
            const segment = day < rawFloor ? 'A' : 'B';
            const selectSql = segment === 'A' ? segmentASelectSql(options.database, day) : segmentBSelectSql(options.database, day);
            const rows = await selectedRowCount(client, selectSql);
            const removeSql = deleteSql(options.database, day);
            const writeSql = insertSql(options.database, selectSql);

            console.log(`[${day}] segment ${segment}: ${rows} aggregate rows`);
            if (options.dryRun) {
                console.log(`${removeSql};\n${writeSql};`);
                continue;
            }
            await client.command({ query: removeSql });
            await client.command({ query: writeSql });
        }
        console.log(`\nVerification queries:\n${verificationQueries(options.database, rawFloor)}`);
    } finally {
        await client.close();
    }
}

void run(parseOptions(process.argv.slice(2))).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
});
