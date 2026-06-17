/**
 * Show, per environment × service, which master commit is live, when it was deployed, who authored
 * it, and how many commits that DIRECTLY touch that service are not yet deployed.
 *
 *   tsx scripts/deploy-status/cli.ts [--env dev|staging|prod] [--service <key>] [--verbose] [--json]
 *
 * Deployed SHAs + dates come from the deploy workflow run history (gh); drift is computed locally
 * against origin/master. Commit SHAs are clickable links to GitHub in terminals that support it.
 */
import { parseArgs } from 'node:util';

import chalk from 'chalk';

import { computeDrift, ensureFetched, latestDirectCommit, prefetchCommits } from './engine.ts';
import { SERVICES, buildMappingContext } from './services.ts';
import { ENVIRONMENTS, fetchDeployRuns, fetchPullRequests, latestDeploy } from './sources.ts';

import type { CommitInfo, Drift } from './engine.ts';
import type { DeployedRef } from './sources.ts';

const GITHUB_COMMIT_BASE = 'https://github.com/NangoHQ/nango/commit';
const GITHUB_PR_BASE = 'https://github.com/NangoHQ/nango/pull';

// Strict flag parsing via node's built-in parseArgs (as in scripts/wrap-dek): unknown or malformed
// flags fail loudly instead of being silently ignored.
function parseFlags() {
    try {
        return parseArgs({
            options: {
                env: { type: 'string' },
                service: { type: 'string' },
                verbose: { type: 'boolean', default: false },
                json: { type: 'boolean', default: false }
            }
        }).values;
    } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        console.error('Usage: tsx scripts/deploy-status/cli.ts [--env dev|staging|prod] [--service <key>] [--verbose] [--json]');
        process.exit(1);
    }
}

const short = (sha: string): string => sha.slice(0, 9);

// OSC 8 terminal hyperlink — renders as a clickable link, degrades to plain text elsewhere.
function link(text: string, url: string): string {
    return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}
function commitLink(sha: string): string {
    return link(short(sha), `${GITHUB_COMMIT_BASE}/${sha}`);
}
// Turn any "(#1234)" PR reference in a commit subject into a clickable link.
function linkifyPr(subject: string): string {
    return subject.replace(/#(\d+)/g, (match, num: string) => link(match, `${GITHUB_PR_BASE}/${num}`));
}

function relativeTime(iso: string): string {
    const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    const units: [number, string][] = [
        [60, 'second'],
        [60, 'minute'],
        [24, 'hour'],
        [7, 'day'],
        [4.345, 'week'],
        [12, 'month'],
        [Number.POSITIVE_INFINITY, 'year']
    ];
    let value = sec;
    for (const [size, label] of units) {
        if (value < size) {
            const n = Math.floor(value);
            return n <= 0 ? 'just now' : `${n} ${label}${n === 1 ? '' : 's'} ago`;
        }
        value /= size;
    }
    return 'just now';
}

function ageDays(iso: string): number {
    return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function directCount(drift: Drift | null): number {
    return drift ? drift.undeployed.filter((c) => c.reason === 'direct').length : 0;
}

interface Status {
    plain: string; // unstyled, used for column width
    color: (s: string) => string;
    link?: { label: string; url: string }; // a substring of `plain` to turn into a hyperlink
}

// Status text + colour. "behind" counts only commits that directly touch the service; 0 direct →
// up to date. Feature-branch deploys are labelled by their PR ("PR #1234") when one can be resolved.
function statusOf(ref: DeployedRef, drift: Drift | null, prNumber?: number): Status {
    if (!ref.sha || !drift) return { plain: 'unknown', color: chalk.gray };
    if (drift.status === 'orphaned') return { plain: 'orphaned', color: chalk.red };

    const direct = directCount(drift);
    const behind = direct > 0 ? `, ${direct} behind` : ', current';

    if (drift.status === 'feature-branch') {
        if (prNumber) {
            const label = `PR #${prNumber}`;
            return { plain: `${label}${behind}`, color: chalk.cyan, link: { label, url: `${GITHUB_PR_BASE}/${prNumber}` } };
        }
        return { plain: `feature-branch${behind}`, color: chalk.cyan };
    }

    return direct === 0 ? { plain: 'up to date', color: chalk.green } : { plain: `${direct} behind`, color: chalk.yellow };
}

function renderStatus(s: Status, width: number): string {
    const body = s.link ? s.plain.replace(s.link.label, link(s.link.label, s.link.url)) : s.plain;
    return s.color(body) + ' '.repeat(Math.max(0, width - s.plain.length));
}

// Relative deploy date; coloured by staleness only when there ARE direct commits waiting to ship.
function dateOf(ref: DeployedRef, drift: Drift | null): { plain: string; color: (s: string) => string } {
    if (!ref.date) return { plain: '', color: chalk.dim };
    const plain = relativeTime(ref.date);
    if (directCount(drift) > 0) {
        const days = ageDays(ref.date);
        if (days >= 14) return { plain, color: chalk.red };
        if (days >= 7) return { plain, color: chalk.yellow };
    }
    return { plain, color: chalk.dim };
}

interface DisplayRow {
    key: string;
    deployedSha: string | null;
    date: { plain: string; color: (s: string) => string };
    status: Status;
    undeployed: CommitInfo[];
}

async function main(): Promise<void> {
    const start = Date.now();
    const flags = parseFlags();
    const envFilter = flags.env;
    const serviceFilter = flags.service;
    const verbose = flags.verbose;
    const asJson = flags.json;

    const envs = ENVIRONMENTS.filter((e) => !envFilter || e.name === envFilter);
    const services = SERVICES.filter((s) => !serviceFilter || s.key === serviceFilter);
    if (envs.length === 0) throw new Error(`Unknown --env "${envFilter}". Valid: ${ENVIRONMENTS.map((e) => e.name).join(', ')}`);
    if (services.length === 0) throw new Error(`Unknown --service "${serviceFilter}". Valid: ${SERVICES.map((s) => s.key).join(', ')}`);

    await ensureFetched();
    const ctx = buildMappingContext();

    let runs: Awaited<ReturnType<typeof fetchDeployRuns>> = [];
    try {
        runs = await fetchDeployRuns();
    } catch (err) {
        console.error(chalk.red(String(err)));
    }

    const plan = envs.map((env) => ({ env, items: services.map((service) => ({ service, ref: latestDeploy(runs, env.stage, service.key) })) }));
    const deployedShas = plan.flatMap((p) => p.items.map((i) => i.ref.sha).filter((s): s is string => Boolean(s)));

    // Fetch all deployed commits up front so drift can be computed concurrently below.
    await prefetchCommits(deployedShas);

    const [byEnv, latestByService] = await Promise.all([
        Promise.all(
            plan.map(async ({ env, items }) => ({
                env,
                rows: await Promise.all(
                    items.map(async ({ service, ref }) => ({
                        service,
                        ref,
                        drift: ref.sha ? await computeDrift(ref.sha, service, ctx, { skipFetch: true }) : null
                    }))
                )
            }))
        ),
        Promise.all(services.map(async (s) => [s.key, await latestDirectCommit(s)] as const)).then((entries) => new Map(entries))
    ]);

    // Resolve PR numbers for feature-branch deploys so we can show "PR #1234" instead of "feature-branch".
    const featureBranchShas = byEnv.flatMap(({ rows }) =>
        rows.filter((r) => r.drift?.status === 'feature-branch' && r.ref.sha).map((r) => r.ref.sha as string)
    );
    const prNumbers = await fetchPullRequests(featureBranchShas);

    if (asJson) {
        console.log(
            JSON.stringify(
                byEnv.map(({ env, rows }) => ({
                    env: env.name,
                    services: rows.map(({ service, ref, drift }) => ({
                        service: service.key,
                        deployedSha: ref.sha,
                        deployedAt: ref.date,
                        pr: ref.sha ? (prNumbers.get(ref.sha) ?? null) : null,
                        status: drift?.status ?? null,
                        directBehind: drift ? directCount(drift) : null,
                        totalBehind: drift?.undeployed.length ?? null,
                        latestDirect: latestByService.get(service.key)?.sha ?? null,
                        undeployed: drift?.undeployed ?? []
                    }))
                })),
                null,
                2
            )
        );
        console.error(chalk.dim(`Finished in ${((Date.now() - start) / 1000).toFixed(0)}s`));
        return;
    }

    // Build display rows, then size columns to the widest content so nothing shifts.
    const display = byEnv.map(({ env, rows }) => ({
        env,
        rows: rows.map(
            ({ service, ref, drift }): DisplayRow => ({
                key: service.key,
                deployedSha: ref.sha,
                date: dateOf(ref, drift),
                status: statusOf(ref, drift, ref.sha ? prNumbers.get(ref.sha) : undefined),
                undeployed: drift?.undeployed ?? []
            })
        )
    }));
    const all = display.flatMap((d) => d.rows);
    const wKey = Math.max(...all.map((r) => r.key.length));
    const wDate = Math.max(0, ...all.map((r) => r.date.plain.length));
    const wStatus = Math.max(...all.map((r) => r.status.plain.length));
    const anyBehind = all.some((r) => r.undeployed.some((c) => c.reason === 'direct'));

    for (const { env, rows } of display) {
        // "latest" is env-independent, so show it in just one group: prod when all envs are shown,
        // otherwise the single env that's displayed.
        const showLatest = envs.length === 1 || env.name === 'prod';
        console.log(chalk.bold.underline(`\n${env.name}`));
        for (const r of rows) {
            const directBehind = r.undeployed.filter((c) => c.reason === 'direct');
            const deployed = r.deployedSha ? commitLink(r.deployedSha) : chalk.gray('—'.padEnd(9));
            const date = r.date.color(r.date.plain.padEnd(wDate));
            const stat = renderStatus(r.status, wStatus);
            const latest = latestByService.get(r.key);
            const latestCell = showLatest && directBehind.length > 0 && latest ? `${chalk.dim('latest')} ${commitLink(latest.sha)}` : '';
            console.log(`  ${chalk.bold(r.key.padEnd(wKey))}  ${deployed}  ${date}  ${stat}  ${latestCell}`);

            // --verbose lists the direct (counted) commits behind as a tree under the service, so
            // they're easy to associate. Commit hash + title, both the hash and PR ref clickable.
            if (verbose) {
                directBehind.forEach((c, i) => {
                    const branch = i === directBehind.length - 1 ? '└──' : '├──';
                    console.log(`  ${chalk.dim(branch)} ${commitLink(c.sha)} ${linkifyPr(c.subject)}`);
                });
            }
        }
    }

    if (anyBehind && !verbose) {
        console.log(chalk.dim('\nTip: add --verbose to list the undeployed commits behind each service (and --env <dev|staging|prod> to focus on one).'));
    }
    console.error(chalk.dim(`\nFinished in ${((Date.now() - start) / 1000).toFixed(0)}s`));
}

await main();
