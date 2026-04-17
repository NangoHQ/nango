import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createOpencode } from '@opencode-ai/sdk';
import { config } from 'dotenv';
import { dump, load } from 'js-yaml';

import type { Provider, ProviderAlias } from '@nangohq/types';
import type { AssistantMessage, Message, OpencodeClient, Part, Session, SessionStatus } from '@opencode-ai/sdk';

type ProviderEntry = Provider | ProviderAlias;
type ProvidersMap = Record<string, ProviderEntry>;
type ProviderScopesMap = Record<string, string[]>;
interface MessageWithParts {
    info: Message;
    parts: Part[];
}

interface CliArgs {
    write: boolean;
    fromDiff: boolean;
    all: boolean;
    check: boolean;
    baseRef?: string;
    verbose: boolean;
    providers: string[];
    force: boolean;
    mode: 'deterministic' | 'agent';
    model: string;
    port: number;
    pollIntervalMs: number;
    sessionTimeoutMinutes: number;
    keepSession: boolean;
    batchSize: number;
}

interface InferenceResult {
    scopes: string[];
    source: 'default_scopes' | 'alias' | 'existing' | 'none';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');

config({ path: path.join(ROOT_DIR, '.env') });
const providersPath = path.join(__dirname, '../../../packages/providers/providers.yaml');
const providersScopesPath = path.join(__dirname, '../../../packages/providers/providers.scopes.yaml');
const DEFAULT_MODEL = 'opencode/kimi-k2.5';
const DEFAULT_PORT = 4096;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_SESSION_TIMEOUT_MINUTES = 2;
const DEFAULT_BATCH_SIZE = 20;

const args = parseArgs();

const providers = loadProviders();
const oauth2Providers = getOAuth2ProviderNames(providers);
const providerScopes = loadProviderScopes();

const targetProviders =
    args.providers.length > 0 ? getExplicitTargetProviderNames(providers) : args.all ? oauth2Providers : getDiffTargetProviderNames(providers);
const oauth2TargetProviders = (() => {
    const all = targetProviders.filter((name) => oauth2Providers.includes(name));
    if (args.force) {
        return all;
    }
    const skipped = all.filter((name) => providerScopes[name] && providerScopes[name].length > 0);
    if (skipped.length > 0) {
        console.log(`Skipping ${skipped.length} already-present provider(s) (use --force to re-process)`);
    }
    return all.filter((name) => !providerScopes[name] || providerScopes[name].length === 0);
})();
const nonOauth2Targets = targetProviders.filter((name) => !oauth2Providers.includes(name));

if (nonOauth2Targets.length > 0) {
    console.warn(`Skipping non-OAuth2 provider(s): ${nonOauth2Targets.sort().join(', ')}`);
}

if (args.verbose) {
    console.log(`Loaded ${Object.keys(providers).length} providers`);
    console.log(`Loaded ${Object.keys(providerScopes).length} scoped providers`);
    console.log(`Detected ${oauth2Providers.length} OAuth2 providers`);
    console.log(`Targeting ${oauth2TargetProviders.length} OAuth2 providers`);
}

if (oauth2TargetProviders.length === 0) {
    console.log('No changed OAuth2 providers found. Nothing to do.');
    process.exit(0);
}

if (args.mode === 'agent') {
    await runAgentMode();

    // After the agent runs, apply default_scopes as a fallback for providers it couldn't resolve
    const postAgentScopes = loadProviderScopes();
    const stillEmpty = oauth2TargetProviders.filter((name) => !postAgentScopes[name] || postAgentScopes[name].length === 0);
    if (stillEmpty.length > 0) {
        const nextScopes = { ...postAgentScopes };
        const fallbackChanged: string[] = [];
        for (const providerName of stillEmpty) {
            const inference = inferScopes(providerName, providers, postAgentScopes);
            if (inference.source === 'default_scopes') {
                nextScopes[providerName] = inference.scopes;
                fallbackChanged.push(providerName);
            }
        }
        if (fallbackChanged.length > 0 && args.write) {
            const existingComments = extractYamlComments(fs.readFileSync(providersScopesPath, 'utf-8'));
            fs.writeFileSync(providersScopesPath, renderScopesYaml(nextScopes, existingComments));
            console.log(`Applied default_scopes fallback for: ${fallbackChanged.sort().join(', ')}`);
        }
    }

    process.exit(0);
}

const nextScopes = { ...providerScopes };
const changed: string[] = [];
const unresolved: string[] = [];

for (const providerName of oauth2TargetProviders) {
    const before = providerScopes[providerName] || [];
    const inference = inferScopes(providerName, providers, providerScopes);
    const after = inference.scopes;

    if (!providerScopes[providerName] || !sameScopes(before, after)) {
        nextScopes[providerName] = after;
        changed.push(providerName);
    }

    if (inference.source === 'none') {
        unresolved.push(providerName);
    }
}

const staleKeys: string[] = [];
const filteredScopes: ProviderScopesMap = {};
for (const [key, value] of Object.entries(nextScopes)) {
    if (oauth2Providers.includes(key)) {
        filteredScopes[key] = value;
    } else {
        staleKeys.push(key);
    }
}

if (staleKeys.length > 0) {
    changed.push(...staleKeys);
}

const previousContent = fs.existsSync(providersScopesPath) ? fs.readFileSync(providersScopesPath, 'utf-8') : '';
const existingComments = extractYamlComments(previousContent);
const nextContent = renderScopesYaml(filteredScopes, existingComments);
const hasContentChanges = previousContent !== nextContent;

if (changed.length > 0) {
    console.log(`Providers evaluated: ${oauth2TargetProviders.length}`);
    console.log(`Providers updated: ${changed.length}`);
    console.log(`Updated keys: ${changed.sort().join(', ')}`);
} else {
    console.log('No scope entries needed updates.');
}

if (unresolved.length > 0) {
    console.warn('These OAuth2 providers have no resolvable scope source (default_scopes or alias scopes):');
    console.warn(`- ${unresolved.sort().join('\n- ')}`);
    console.warn('Empty arrays were written for those providers. Fill them manually with verified provider scopes.');
}

if (args.check && hasContentChanges) {
    console.error('providers.scopes.yaml is out of date.');
    console.error(`Run: npx tsx scripts/validation/providers/sync-scopes.ts ${args.fromDiff ? '--from-diff ' : ''}--write`);
    process.exit(1);
}

if (args.write && hasContentChanges) {
    fs.writeFileSync(providersScopesPath, nextContent);
    console.log(`Updated ${providersScopesPath}`);
}

if (!args.write && hasContentChanges && !args.check) {
    console.log('Changes detected, but not written. Re-run with --write to apply.');
}

process.exit(0);

function parseArgs(): CliArgs {
    const out: CliArgs = {
        write: false,
        fromDiff: false,
        all: false,
        check: false,
        verbose: false,
        providers: [],
        force: false,
        mode: 'deterministic',
        model: DEFAULT_MODEL,
        port: DEFAULT_PORT,
        pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
        sessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES,
        keepSession: false,
        batchSize: DEFAULT_BATCH_SIZE
    };

    for (const arg of process.argv.slice(2)) {
        if (arg === '--write') {
            out.write = true;
        } else if (arg === '--from-diff') {
            out.fromDiff = true;
        } else if (arg === '--all') {
            out.all = true;
        } else if (arg === '--check') {
            out.check = true;
        } else if (arg === '--verbose') {
            out.verbose = true;
        } else if (arg.startsWith('--provider=')) {
            const providerNames = arg
                .slice('--provider='.length)
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            out.providers.push(...providerNames);
        } else if (arg === '--force') {
            out.force = true;
        } else if (arg === '--agent') {
            out.mode = 'agent';
        } else if (arg === '--deterministic') {
            out.mode = 'deterministic';
        } else if (arg.startsWith('--model=')) {
            out.model = arg.slice('--model='.length).trim();
        } else if (arg.startsWith('--port=')) {
            out.port = Number.parseInt(arg.slice('--port='.length).trim(), 10);
        } else if (arg.startsWith('--poll-interval-ms=')) {
            out.pollIntervalMs = Number.parseInt(arg.slice('--poll-interval-ms='.length).trim(), 10);
        } else if (arg.startsWith('--session-timeout-minutes=')) {
            out.sessionTimeoutMinutes = Number.parseFloat(arg.slice('--session-timeout-minutes='.length).trim());
        } else if (arg === '--keep-session') {
            out.keepSession = true;
        } else if (arg.startsWith('--batch-size=')) {
            out.batchSize = Number.parseInt(arg.slice('--batch-size='.length).trim(), 10);
        } else if (arg.startsWith('--base=')) {
            out.baseRef = arg.slice('--base='.length).trim();
        } else if (arg === '--help' || arg === '-h') {
            console.log(
                [
                    'Usage:',
                    '  npx tsx scripts/validation/providers/sync-scopes.ts [options]',
                    '',
                    'Options:',
                    '  --from-diff      Only process providers changed in git diff',
                    '  --provider=<id>  Process only specified provider (comma-separated or repeatable)',
                    '  --base=<ref>     Base git ref for --from-diff (default: origin/<HEAD branch>)',
                    '  --all            Process all OAuth2 providers',
                    '  --force          Re-process target providers even if already present in scopes file',
                    '  --check          Exit non-zero when output is outdated',
                    '  --write          Write changes to providers.scopes.yaml',
                    '  --verbose        Print debug details',
                    '',
                    'Agent options:',
                    '  --agent                     Use OpenCode agent to update scopes',
                    '  --deterministic             Force deterministic mode (default)',
                    `  --model=<provider/model>    Agent model (default: ${DEFAULT_MODEL})`,
                    '  --port=<number>             OpenCode server port (default: 4096)',
                    '  --poll-interval-ms=<number> Poll interval for session status',
                    '  --session-timeout-minutes=<number> Session timeout (0 = unlimited)',
                    `  --batch-size=<number>       Providers per agent session (default: ${DEFAULT_BATCH_SIZE})`,
                    '  --keep-session              Do not delete the OpenCode session'
                ].join('\n')
            );
            process.exit(0);
        }
    }

    if (out.providers.length === 0 && !out.fromDiff && !out.all) {
        out.fromDiff = true;
    }

    return out;
}

function loadProviders(): ProvidersMap {
    const providersYaml = fs.readFileSync(providersPath, 'utf-8');
    const parsed = load(providersYaml) as ProvidersMap | null;
    if (!parsed) {
        throw new Error(`Unable to parse providers at ${providersPath}`);
    }
    return parsed;
}

function loadProviderScopes(): ProviderScopesMap {
    if (!fs.existsSync(providersScopesPath)) {
        return {};
    }
    const sanitized = sanitizeYamlContent(fs.readFileSync(providersScopesPath, 'utf-8'));
    const { content, duplicates } = removeDuplicateYamlKeys(sanitized);
    if (duplicates.length > 0) {
        if (args.write) {
            console.warn(`providers.scopes.yaml has duplicate keys (auto-fixing, keeping last occurrence): ${duplicates.sort().join(', ')}`);
            fs.writeFileSync(providersScopesPath, content);
        } else {
            console.warn(`providers.scopes.yaml has duplicate keys: ${duplicates.sort().join(', ')}. Re-run with --write to auto-fix.`);
        }
    }
    return (load(content) as ProviderScopesMap | null) ?? {};
}

function getOAuth2ProviderNames(providerMap: ProvidersMap): string[] {
    return Object.keys(providerMap)
        .filter((name) => isOAuth2Provider(name, providerMap))
        .sort();
}

function isOAuth2Provider(providerName: string, providerMap: ProvidersMap, seen = new Set<string>()): boolean {
    if (seen.has(providerName)) {
        return false;
    }
    seen.add(providerName);

    const entry = providerMap[providerName];
    if (!entry) {
        return false;
    }

    if ('alias' in entry) {
        return isOAuth2Provider(entry.alias, providerMap, seen);
    }

    return (entry as Provider).auth_mode === 'OAUTH2';
}

function inferScopes(providerName: string, providerMap: ProvidersMap, originalScopes: ProviderScopesMap, seen = new Set<string>()): InferenceResult {
    if (seen.has(providerName)) {
        return { scopes: [], source: 'none' };
    }
    seen.add(providerName);

    const entry = providerMap[providerName];
    if (!entry) {
        return { scopes: [], source: 'none' };
    }

    const existing = originalScopes[providerName];
    if (existing && existing.length > 0) {
        return { scopes: dedupeAndSort(existing), source: 'existing' };
    }

    if ('alias' in entry) {
        // Aliases must be looked up independently by the agent, never copy from the parent provider
        return { scopes: [], source: 'none' };
    }

    const defaults = Array.isArray((entry as Provider).default_scopes) ? (entry as Provider).default_scopes! : [];
    if (defaults.length > 0) {
        return { scopes: dedupeAndSort(defaults), source: 'default_scopes' };
    }

    return { scopes: [], source: 'none' };
}

function dedupeAndSort(scopes: string[]): string[] {
    return [...new Set(scopes)].sort((a, b) => a.localeCompare(b));
}

function sameScopes(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

function renderScopesYaml(scopes: ProviderScopesMap, comments?: Record<string, string>): string {
    const keys = Object.keys(scopes).sort((a, b) => a.localeCompare(b));
    const lines: string[] = [];

    for (const key of keys) {
        const values = dedupeAndSort(scopes[key] || []);
        if (comments?.[key]) {
            lines.push(comments[key]);
        }
        if (values.length === 0) {
            lines.push(`${key}: []`);
            lines.push('');
            continue;
        }

        lines.push(`${key}:`);
        for (const value of values) {
            lines.push(`  - ${dump(value).trimEnd()}`);
        }
        lines.push('');
    }

    return `${lines.join('\n').trimEnd()}\n`;
}

function extractYamlComments(content: string): Record<string, string> {
    const lines = content.split('\n');
    const comments: Record<string, string> = {};

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const keyMatch = line.match(/^([a-z0-9][a-z0-9_-]*):/);
        if (!keyMatch?.[1]) continue;

        const commentLines: string[] = [];
        let j = i - 1;
        while (j >= 0 && lines[j]?.startsWith('#')) {
            commentLines.unshift(lines[j]!);
            j--;
        }
        if (commentLines.length > 0) {
            comments[keyMatch[1]] = commentLines.join('\n');
        }
    }

    return comments;
}

function getDiffTargetProviderNames(providerMap: ProvidersMap): string[] {
    const baseRef = args.baseRef || getDefaultBaseRef();
    const changed = getChangedProviderNames(baseRef);

    if (changed.length === 0) {
        return [];
    }

    return changed.filter((name) => providerMap[name] !== undefined).sort();
}

function getExplicitTargetProviderNames(providerMap: ProvidersMap): string[] {
    const deduped = [...new Set(args.providers)];
    const known = deduped.filter((name) => providerMap[name] !== undefined);
    const unknown = deduped.filter((name) => providerMap[name] === undefined);

    if (unknown.length > 0) {
        console.warn(`Skipping unknown provider(s): ${unknown.sort().join(', ')}`);
    }

    return known.sort();
}

function getDefaultBaseRef(): string {
    const output = runGit(['remote', 'show', 'origin']);
    if (!output.ok) {
        throw new Error(`Unable to detect origin HEAD branch.\n${output.stderr}`);
    }

    const match = output.stdout.match(/HEAD branch:\s+([^\n]+)/);
    if (!match?.[1]) {
        throw new Error('Unable to parse origin HEAD branch from `git remote show origin`.');
    }

    return `origin/${match[1].trim()}`;
}

function getChangedProviderNames(baseRef: string): string[] {
    const output = runGit(['diff', '--unified=0', baseRef, '--', 'packages/providers/providers.yaml']);
    if (!output.ok) {
        throw new Error(`Unable to read git diff from ${baseRef}.\n${output.stderr}`);
    }

    const names = new Set<string>();
    for (const line of output.stdout.split('\n')) {
        if (!line.startsWith('+') && !line.startsWith('-')) {
            continue;
        }
        if (line.startsWith('+++') || line.startsWith('---')) {
            continue;
        }

        const content = line.slice(1);
        if (content.startsWith(' ') || content.startsWith('\t')) {
            continue;
        }

        const match = content.match(/^([a-z0-9][a-z0-9_-]*):\s*$/);
        if (match?.[1]) {
            names.add(match[1]);
        }
    }

    return [...names];
}

function runGit(gitArgs: string[]): { ok: true; stdout: string; stderr: string } | { ok: false; stdout: string; stderr: string } {
    try {
        const stdout = execSync(`git ${gitArgs.map(shellEscape).join(' ')}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { ok: true, stdout, stderr: '' };
    } catch (err_) {
        const err = err_ as NodeJS.ErrnoException & { stdout?: string | Buffer; stderr?: string | Buffer };
        return {
            ok: false,
            stdout: err.stdout ? err.stdout.toString() : '',
            stderr: err.stderr ? err.stderr.toString() : err.message
        };
    }
}

function shellEscape(value: string): string {
    return `'${value.split("'").join(`'\\''`)}'`;
}

async function runAgentMode(): Promise<void> {
    if (!args.write) {
        console.error('Agent mode requires --write to allow file updates.');
        process.exit(1);
    }

    const [modelProvider] = args.model.split('/');
    if (modelProvider !== 'opencode') {
        throw new Error(`Unsupported model provider "${modelProvider}" in model "${args.model}". Supported: opencode.`);
    }

    const apiKey = getOpencodeApiKey();
    checkPort(args.port);

    const opencodeConfig = {
        model: args.model,
        permission: {
            external_directory: 'deny',
            doom_loop: 'allow',
            read: { '*': 'allow' },
            edit: { [providersScopesPath]: 'allow' }
        }
    };

    const { client, server } = await createOpencode({
        port: args.port,
        config: opencodeConfig as any
    });

    await client.auth.set({
        path: { id: 'opencode' },
        body: { type: 'api', key: apiKey }
    });

    const baseRef = args.baseRef || getDefaultBaseRef();
    const batches = chunkArray(oauth2TargetProviders, args.batchSize);
    const totalProviders = oauth2TargetProviders.length;

    console.log(`Processing ${totalProviders} providers in ${batches.length} batch(es) of up to ${args.batchSize}.`);

    let totalCompleted = 0;
    const totalMissing: string[] = [];

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        if (!batch) continue;
        console.log(`\nBatch ${i + 1}/${batches.length}: ${batch.length} providers...`);

        const { completed, missing } = await runAgentBatch(client, batch, baseRef);
        totalCompleted += completed.length;
        totalMissing.push(...missing);

        console.log(`  Done: ${completed.length}/${batch.length} updated`);
        if (completed.length > 0) console.log(`  Updated: ${completed.sort().join(', ')}`);
        if (missing.length > 0) console.warn(`  Skipped: ${missing.sort().join(', ')}`);
    }

    console.log(`\nTotal: ${totalCompleted}/${totalProviders} providers updated.`);
    if (totalMissing.length > 0) {
        console.error(`Missing (${totalMissing.length}): ${totalMissing.sort().join(', ')}`);
    }

    server.close();
}

async function runAgentBatch(client: OpencodeClient, providerNames: string[], baseRef: string): Promise<{ completed: string[]; missing: string[] }> {
    const beforeContent = fs.readFileSync(providersScopesPath, 'utf-8');

    const createRes = await client.session.create({
        throwOnError: true,
        body: { title: 'sync-provider-scopes' },
        query: { directory: ROOT_DIR }
    });
    const session: Session = createRes.data;

    const prompt = buildAgentPrompt({
        providerNames,
        baseRef,
        providersYamlPath: providersPath,
        providersScopesPath
    });

    await client.session.promptAsync({
        throwOnError: true,
        path: { id: session.id },
        query: { directory: ROOT_DIR },
        body: { parts: [{ type: 'text', text: prompt }] }
    });

    let timedOut = false;
    try {
        await waitForSessionCompletion(client, session.id);
    } catch (err) {
        const isTimeout = err instanceof Error && err.message.startsWith('Session timeout');
        if (!isTimeout) throw err;
        timedOut = true;
        console.error(`\n${err.message}`);
        await client.session.abort({
            throwOnError: false,
            path: { id: session.id },
            query: { directory: ROOT_DIR }
        });
    }

    const rawAfterContent = fs.readFileSync(providersScopesPath, 'utf-8');
    const { content: afterContent, duplicates: dupKeys } = removeDuplicateYamlKeys(sanitizeYamlContent(rawAfterContent));
    if (dupKeys.length > 0) {
        console.warn(`  Agent wrote duplicate YAML keys (keeping last occurrence): ${dupKeys.sort().join(', ')}`);
    }
    if (afterContent !== rawAfterContent) {
        fs.writeFileSync(providersScopesPath, afterContent);
    }

    let afterScopes: ProviderScopesMap;
    try {
        afterScopes = (load(afterContent) as ProviderScopesMap | null) ?? {};
    } catch (err) {
        console.error(`  Agent wrote invalid YAML — reverting batch changes: ${err instanceof Error ? err.message : String(err)}`);
        fs.writeFileSync(providersScopesPath, beforeContent);
        return { completed: [], missing: providerNames };
    }
    const beforeScopes = (load(beforeContent) as ProviderScopesMap | null) ?? {};

    const completed = providerNames.filter((p) => {
        const a = dedupeAndSort(beforeScopes[p] ?? []);
        const b = dedupeAndSort(afterScopes[p] ?? []);
        return !sameScopes(a, b);
    });
    const missing = providerNames.filter((p) => !completed.includes(p));

    if (afterContent !== beforeContent) {
        try {
            validateAgentEdits(beforeContent, afterContent, providers, oauth2Providers, providerNames);
        } catch (err) {
            fs.writeFileSync(providersScopesPath, beforeContent);
            throw err;
        }
        const oauth2OnlyScopes = Object.fromEntries(Object.entries(afterScopes).filter(([key]) => oauth2Providers.includes(key)));
        const afterComments = extractYamlComments(afterContent);
        const normalizedContent = renderScopesYaml(oauth2OnlyScopes, afterComments);
        if (normalizedContent !== afterContent) {
            fs.writeFileSync(providersScopesPath, normalizedContent);
        }
    }

    if (!args.keepSession) {
        await client.session.delete({
            throwOnError: false,
            path: { id: session.id },
            query: { directory: ROOT_DIR }
        });
    }

    if (timedOut) {
        console.warn(`  Batch timed out. Missed: ${missing.sort().join(', ')}`);
    }

    return { completed, missing };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

function getOpencodeApiKey(): string {
    const key = process.env['OPENCODE_API_KEY'] || process.env['OPENCODE_GO_API_KEY'];
    if (!key) {
        throw new Error('Missing OpenCode API key. Set OPENCODE_API_KEY (or OPENCODE_GO_API_KEY).');
    }
    return key;
}

function checkPort(port: number): void {
    let pids: string;
    try {
        pids = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' }).trim();
    } catch {
        return;
    }
    if (!pids) {
        return;
    }
    console.error(`Port ${port} is already in use (PID(s): ${pids.split('\n').filter(Boolean).join(', ')}).`);
    console.error(`Kill the process manually and retry:`);
    console.error(`  kill ${pids.split('\n').filter(Boolean).join(' ')}`);
    process.exit(1);
}

function buildAgentPrompt(params: { providerNames: string[]; baseRef: string; providersYamlPath: string; providersScopesPath: string }): string {
    const namesList = params.providerNames.map((p) => `- ${p}`).join('\n');

    return [
        'You are updating OAuth2 provider scopes for Nango.',
        '',
        'Objective:',
        '- Update only the providers listed below in packages/providers/providers.scopes.yaml.',
        "- For each provider, thoroughly read the provider's COMPLETE OFFICIAL OAuth2 scopes documentation page (not Nango docs) and write EVERY scope listed there.",
        '',
        'Providers to update:',
        namesList,
        '',
        'Strict rules:',
        '1) Only edit packages/providers/providers.scopes.yaml.',
        '2) Only change keys for the listed providers.',
        '3) Keep YAML valid. Each provider entry must be a plain YAML list (e.g. "provider:\\n  - scope1"). No nested keys like "scopes:".',
        '4) SKIP any provider whose auth_mode in providers.yaml is NOT exactly "OAUTH2". Do not write an entry for it at all — not even an empty array.',
        "5) For each OAuth2 provider, search for and fetch the provider's official OAuth2 scopes reference page. READ THE ENTIRE PAGE — scroll through all sections, tables, and sub-sections. Many providers organise scopes into categories (e.g. Zoho CRM lists scopes per module: Leads, Contacts, Deals, etc.) — you MUST include ALL of them.",
        '6) Only include scopes that are explicitly listed on that official page. Do not invent or guess scopes.',
        '7) Exclude deprecated scopes — any scope marked as deprecated, legacy, or superseded by another scope.',
        '8) Exclude scopes that are not passed via the OAuth authorization URL scope parameter. Some providers allow permissions to be configured in their developer platform/dashboard without needing them in the OAuth flow — omit those.',
        '9) Above each provider entry in the YAML, write a comment with the exact official docs URL you read to obtain the scopes, e.g.: # source: https://developer.github.com/v3/oauth/#scopes. If a source comment already exists, keep it (update it only if you used a different URL).',
        '10) If you cannot find an authoritative official scopes page, fall back to providers.yaml default_scopes and note the fallback in the comment, e.g.: # source: providers.yaml (no official scopes page found)',
        '11) Each provider MUST have its own independently defined scope list. Never reference or defer to another provider\'s scopes (e.g. do NOT write "same as google" or copy scopes from google to google-mail). Each provider key must contain the exact scopes valid for that specific provider, looked up from that provider\'s own documentation.',
        '11a) Some providers in providers.yaml are defined as aliases of another provider (e.g. github-app-oauth aliases github, sharepoint-online aliases microsoft). Even for aliases, you MUST independently research and define their own scope list from their specific official documentation. An alias simply means they share the same OAuth2 app infrastructure — their available OAuth2 scopes may differ. Treat each alias as a fully independent provider for the purposes of scope research.',
        '12) Each scope string within a provider entry must be unique — do not list the same scope string more than once.',
        '13) *** MOST IMPORTANT RULE *** The scope list must be EXHAUSTIVE AND COMPLETE. You MUST include EVERY SINGLE scope listed across the ENTIRE official docs page — all categories, all modules, all resource types, all permission levels (READ, WRITE, CREATE, UPDATE, DELETE, ALL, etc.), all sub-scopes. For example, if a provider like Zoho CRM lists scopes per module (ZohoCRM.modules.leads.READ, ZohoCRM.modules.contacts.ALL, etc.) you must include every one of them. Do NOT summarise with wildcard/umbrella scopes only when granular per-resource scopes are also listed. Take as much time as needed — thoroughness is more important than speed. A list of 5 scopes for a provider with 50+ documented scopes is WRONG.',
        '14) Do not ask questions.',
        '',
        `Context base ref for this run: ${params.baseRef}`,
        `Providers source: ${path.relative(ROOT_DIR, params.providersYamlPath)}`,
        `Scopes target: ${path.relative(ROOT_DIR, params.providersScopesPath)}`,
        '',
        'When done, output a short final message listing updated provider keys only.'
    ].join('\n');
}

async function waitForSessionCompletion(client: OpencodeClient, sessionId: string): Promise<void> {
    const timeoutMinutes = Number.isFinite(args.sessionTimeoutMinutes) ? args.sessionTimeoutMinutes : DEFAULT_SESSION_TIMEOUT_MINUTES;
    const timeoutMs = timeoutMinutes <= 0 ? undefined : timeoutMinutes * 60 * 1000;
    const startedAt = Date.now();

    while (true) {
        const elapsed = Date.now() - startedAt;
        if (timeoutMs !== undefined && elapsed > timeoutMs) {
            throw new Error(`Session timeout after ${Math.floor(elapsed / 1000)}s`);
        }

        const statusRes = await client.session.status({
            throwOnError: true,
            query: { directory: ROOT_DIR }
        });
        const statuses = statusRes.data as Record<string, SessionStatus>;
        const status = statuses[sessionId];
        const isActive = status?.type === 'busy' || status?.type === 'retry';

        const messagesRes = await client.session.messages({
            throwOnError: true,
            path: { id: sessionId },
            query: { directory: ROOT_DIR, limit: 100 }
        });
        const messages = messagesRes.data as MessageWithParts[];

        if (hasPendingQuestion(messages)) {
            await client.session.abort({
                throwOnError: false,
                path: { id: sessionId },
                query: { directory: ROOT_DIR }
            });
            throw new Error('Agent asked a question. This run is non-interactive.');
        }

        if (!isActive) {
            const lastAssistant = getLastAssistantMessage(messages);
            if (lastAssistant?.error) {
                throw new Error(JSON.stringify(lastAssistant.error));
            }
            return;
        }

        await sleep(Math.max(250, args.pollIntervalMs));
    }
}

function getLastAssistantMessage(messages: MessageWithParts[]): AssistantMessage | undefined {
    return messages
        .map(({ info }) => info)
        .filter((msg): msg is AssistantMessage => msg.role === 'assistant')
        .reduce<AssistantMessage | undefined>((latest, msg) => {
            if (!latest || msg.time.created >= latest.time.created) {
                return msg;
            }
            return latest;
        }, undefined);
}

function hasPendingQuestion(messages: MessageWithParts[]): boolean {
    return messages.some(({ parts }) => parts.some((part) => part.type === 'tool' && 'tool' in part && part.tool === 'question'));
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeYamlContent(content: string): string {
    return content.replace(/^(\s*-\s+)\*(\s*)$/gm, '$1"*"$2');
}

function removeDuplicateYamlKeys(content: string): { content: string; duplicates: string[] } {
    const lines = content.split('\n');

    const keyPositions: { key: string; lineIdx: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const match = line.match(/^([a-z0-9][a-z0-9_-]*)(\s*:)/);
        if (match?.[1]) {
            keyPositions.push({ key: match[1], lineIdx: i });
        }
    }

    const keyMap = new Map<string, number[]>();
    for (const { key, lineIdx } of keyPositions) {
        if (!keyMap.has(key)) keyMap.set(key, []);
        keyMap.get(key)!.push(lineIdx);
    }

    const duplicates = [...keyMap.entries()].filter(([, idx]) => idx.length > 1).map(([key]) => key);
    if (duplicates.length === 0) {
        return { content, duplicates: [] };
    }

    const linesToRemove = new Set<number>();
    for (const dup of duplicates) {
        const positions = keyMap.get(dup)!;
        for (let i = 0; i < positions.length - 1; i++) {
            const keyLine = positions[i];
            if (keyLine === undefined) continue;
            const nextKeyLine = keyPositions.find((k) => k.lineIdx > keyLine)?.lineIdx ?? lines.length;
            let blockStart = keyLine;
            while (blockStart > 0) {
                const prevLine = lines[blockStart - 1];
                if (!prevLine || (!prevLine.startsWith('#') && prevLine.trim() !== '')) break;
                blockStart--;
            }
            for (let j = blockStart; j < nextKeyLine; j++) {
                linesToRemove.add(j);
            }
        }
    }

    const filtered = lines.filter((_, i) => !linesToRemove.has(i));
    return { content: filtered.join('\n').replace(/\n{3,}/g, '\n\n'), duplicates };
}

function validateAgentEdits(
    beforeContent: string,
    afterContent: string,
    allProviders: ProvidersMap,
    oauth2ProviderNames: string[],
    allowedTouchedProviders: string[]
): void {
    const before = (load(beforeContent) as ProviderScopesMap | null) ?? {};
    const after = (load(afterContent) as ProviderScopesMap | null) ?? {};

    for (const key of Object.keys(after)) {
        if (!oauth2ProviderNames.includes(key)) {
            throw new Error(`Agent wrote non-OAuth2 provider "${key}" in providers.scopes.yaml`);
        }
        if (!(key in allProviders)) {
            throw new Error(`Agent wrote unknown provider "${key}" in providers.scopes.yaml`);
        }
        const value = after[key] ?? [];
        if (!Array.isArray(value)) {
            throw new Error(`Invalid scopes format for provider "${key}" (must be array of strings)`);
        }
        if (!value.every((scope) => typeof scope === 'string')) {
            throw new Error(`Invalid non-string scope value for provider "${key}"`);
        }
    }

    const outOfScope: string[] = [];
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
        const a = dedupeAndSort(before[key] ?? []);
        const b = dedupeAndSort(after[key] ?? []);
        if (!sameScopes(a, b) && !allowedTouchedProviders.includes(key)) {
            outOfScope.push(key);
        }
    }
    if (outOfScope.length > 0) {
        console.warn(`  Agent also updated out-of-scope provider(s) (keeping changes): ${outOfScope.sort().join(', ')}`);
    }
}
