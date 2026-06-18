/**
 * Show, per environment × service, which master commit is live, when it was deployed, and how many
 * commits that DIRECTLY touch that service are not yet deployed.
 *
 *   tsx scripts/deploy-status/cli.ts [--env dev|staging|prod] [--service <key>] [--verbose] [--json]
 *
 * Data comes from collectStatus(); this file only renders it for the terminal. Commit SHAs are
 * clickable links to GitHub in terminals that support it.
 */
import { parseArgs } from 'node:util';

import chalk from 'chalk';

import { collectStatus } from './report.ts';

import type { ServiceStatus } from './report.ts';

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

interface Cell {
    plain: string; // unstyled, used for column width
    color: (s: string) => string;
    link?: { label: string; url: string }; // a substring of `plain` to turn into a hyperlink
}

// "behind" counts only commits that directly touch the service; 0 direct → up to date. Feature-branch
// deploys are labelled by their PR ("PR #1234") when one can be resolved.
function statusOf(s: ServiceStatus): Cell {
    if (!s.deployedSha || s.status === null) return { plain: 'unknown', color: chalk.gray };
    if (s.status === 'orphaned') return { plain: 'orphaned', color: chalk.red };

    const direct = s.directBehind ?? 0;
    const behind = direct > 0 ? `, ${direct} behind` : ', current';

    if (s.status === 'feature-branch') {
        if (s.pr) {
            const label = `PR #${s.pr}`;
            return { plain: `${label}${behind}`, color: chalk.cyan, link: { label, url: `${GITHUB_PR_BASE}/${s.pr}` } };
        }
        return { plain: `feature-branch${behind}`, color: chalk.cyan };
    }

    return direct === 0 ? { plain: 'up to date', color: chalk.green } : { plain: `${direct} behind`, color: chalk.yellow };
}

function renderStatus(s: Cell, width: number): string {
    const body = s.link ? s.plain.replace(s.link.label, link(s.link.label, s.link.url)) : s.plain;
    return s.color(body) + ' '.repeat(Math.max(0, width - s.plain.length));
}

// Relative deploy date; coloured by staleness only when there ARE direct commits waiting to ship.
function dateOf(s: ServiceStatus): { plain: string; color: (str: string) => string } {
    if (!s.deployedAt) return { plain: '', color: chalk.dim };
    const plain = relativeTime(s.deployedAt);
    if ((s.directBehind ?? 0) > 0) {
        const days = ageDays(s.deployedAt);
        if (days >= 14) return { plain, color: chalk.red };
        if (days >= 7) return { plain, color: chalk.yellow };
    }
    return { plain, color: chalk.dim };
}

async function main(): Promise<void> {
    const start = Date.now();
    const flags = parseFlags();

    const data = await collectStatus({ envName: flags.env, serviceKey: flags.service });

    if (flags.json) {
        console.log(JSON.stringify(data, null, 2));
        console.error(chalk.dim(`Finished in ${((Date.now() - start) / 1000).toFixed(0)}s`));
        return;
    }

    // Precompute cells, then size columns to the widest content so nothing shifts.
    const display = data.map((env) => ({
        env: env.env,
        rows: env.services.map((s) => ({ s, date: dateOf(s), status: statusOf(s) }))
    }));
    const all = display.flatMap((d) => d.rows);
    const wKey = Math.max(...all.map((r) => r.s.service.length));
    const wDate = Math.max(0, ...all.map((r) => r.date.plain.length));
    const wStatus = Math.max(...all.map((r) => r.status.plain.length));
    const anyBehind = all.some((r) => (r.s.directBehind ?? 0) > 0);

    for (const { env, rows } of display) {
        // "latest" is env-independent, so show it in just one group: prod when all envs are shown,
        // otherwise the single env that's displayed.
        const showLatest = display.length === 1 || env === 'prod';
        console.log(chalk.bold.underline(`\n${env}`));
        for (const { s, date, status } of rows) {
            const directBehind = s.undeployed.filter((c) => c.reason === 'direct');
            const deployed = s.deployedSha ? commitLink(s.deployedSha) : chalk.gray('—'.padEnd(9));
            const dateCell = date.color(date.plain.padEnd(wDate));
            const statusCell = renderStatus(status, wStatus);
            const latestCell = showLatest && directBehind.length > 0 && s.latestDirect ? `${chalk.dim('latest')} ${commitLink(s.latestDirect)}` : '';
            console.log(`  ${chalk.bold(s.service.padEnd(wKey))}  ${deployed}  ${dateCell}  ${statusCell}  ${latestCell}`);

            // --verbose lists the direct (counted) commits behind as a tree under the service, so
            // they're easy to associate. Commit hash + title, both the hash and PR ref clickable.
            if (flags.verbose) {
                directBehind.forEach((c, i) => {
                    const branch = i === directBehind.length - 1 ? '└──' : '├──';
                    console.log(`  ${chalk.dim(branch)} ${commitLink(c.sha)} ${linkifyPr(c.subject)}`);
                });
            }
        }
    }

    if (anyBehind && !flags.verbose) {
        console.log(chalk.dim('\nTip: add --verbose to list the undeployed commits behind each service (and --env <dev|staging|prod> to focus on one).'));
    }
    console.error(chalk.dim(`\nFinished in ${((Date.now() - start) / 1000).toFixed(0)}s`));
}

await main();
