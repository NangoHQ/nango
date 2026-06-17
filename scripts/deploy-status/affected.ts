/**
 * Compute which deployable services a range of commits affects, and emit a report.
 * Used by the merge-time "should deploy" GitHub Action (.github/workflows/notify-deploy-needed.yaml)
 * and runnable locally to preview what a merge would announce.
 *
 *   tsx scripts/deploy-status/affected.ts --base <sha> --head <sha> [--format text|slack|json]
 *
 * Defaults: base/head from $BASE_SHA/$HEAD_SHA env (set by the workflow), format "text".
 */
import { execFileSync } from 'node:child_process';

import { affectedByFiles, buildMappingContext } from './services.ts';

import type { Affected } from './services.ts';

const REPO = process.env['DEPLOY_REPO'] ?? 'NangoHQ/nango';
const DEPLOY_WORKFLOW_URL = `https://github.com/${REPO}/actions/workflows/deploy.yaml`;

function arg(name: string): string | undefined {
    const idx = process.argv.indexOf(`--${name}`);
    return idx >= 0 ? process.argv[idx + 1] : undefined;
}

// Uses node:child_process (not zx) so the merge workflow can run this with `npx tsx` alone — no npm ci.
function changedFiles(base: string, head: string): string[] {
    // --no-renames so a renamed file shows both old and new paths (both may map to services).
    const out = execFileSync('git', ['diff', '--name-only', '--no-renames', base, head], { encoding: 'utf8' });
    return out
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
}

function renderText(affected: Affected[]): string {
    if (affected.length === 0) return 'No deployable services affected by these changes.';
    const lines = affected.map((a) => `  - ${a.service.key}${a.reason === 'via-shared' ? ' (via shared package)' : ''}`);
    return `Changes landed on master — these services should be deployed:\n${lines.join('\n')}`;
}

function renderSlack(affected: Affected[]): string {
    // Slack mrkdwn. Empty string signals "nothing to announce" to the workflow.
    if (affected.length === 0) return '';
    const lines = affected.map((a) => `• \`${a.service.key}\`${a.reason === 'via-shared' ? ' _(via shared package)_' : ''}`);
    return [':package: *Changes landed on `master` — these services should be deployed:*', ...lines, `<${DEPLOY_WORKFLOW_URL}|Run a deploy>`].join('\n');
}

const head = arg('head') ?? process.env['HEAD_SHA'] ?? 'HEAD';
let base = arg('base') ?? process.env['BASE_SHA'];
// On a brand-new branch GitHub sends an all-zero "before" SHA; also handle a missing base
// (e.g. local preview) by diffing just the head commit against its first parent.
if (!base || /^0+$/.test(base)) base = `${head}^`;
const format = arg('format') ?? 'text';

const files = changedFiles(base, head);
const ctx = buildMappingContext();
const affected = affectedByFiles(files, ctx);

switch (format) {
    case 'json':
        console.log(JSON.stringify({ base, head, files, services: affected.map((a) => ({ key: a.service.key, reason: a.reason })) }, null, 2));
        break;
    case 'slack':
        process.stdout.write(renderSlack(affected));
        break;
    default:
        console.log(renderText(affected));
}
