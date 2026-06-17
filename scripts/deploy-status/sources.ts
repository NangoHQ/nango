/**
 * Read each service's currently-deployed SHA + deploy date, per environment, from the deploy
 * workflow's run history. Every service is shipped by deploy.yaml, whose run is titled
 * "[Release] [<stage>] Deploy <service>" with headSha equal to the deployed commit (the
 * nango-environments image tag for backend services, the rolled-out image for runner/lambda,
 * the built bundle for the UIs). One `gh run list` covers everything — no nango-environments
 * access and no API key needed.
 */
import { $ } from 'zx';

$.verbose = false;

export interface EnvDef {
    name: string; // dev | staging | prod
    stage: string; // development | staging | production (the deploy `stage` input)
}

// Replit is out of scope.
export const ENVIRONMENTS: EnvDef[] = [
    { name: 'dev', stage: 'development' },
    { name: 'staging', stage: 'staging' },
    { name: 'prod', stage: 'production' }
];

export interface DeployedRef {
    sha: string | null;
    date: string | null; // ISO timestamp of the deploy run, or null when unknown
    note?: string; // why sha is null
}

interface DeployRun {
    displayTitle: string;
    headSha: string;
    conclusion: string;
    createdAt: string;
}

// Fetch recent deploy.yaml runs once; callers match per env+service in memory.
// 1000 runs goes back far enough to catch infrequently-deployed services (UIs/fleet).
export async function fetchDeployRuns(): Promise<DeployRun[]> {
    const r = await $`gh run list --workflow deploy.yaml -L 1000 --json ${'displayTitle,headSha,conclusion,createdAt'}`.nothrow();
    if (r.exitCode !== 0) throw new Error(`gh run list failed: ${r.stderr.trim()}`);
    return JSON.parse(r.stdout) as DeployRun[];
}

// The latest successful deploy of a service to a stage → its commit and when it ran.
export function latestDeploy(runs: DeployRun[], stage: string, serviceKey: string): DeployedRef {
    const needle = `[${stage}] Deploy ${serviceKey}`;
    // gh returns newest-first.
    const match = runs.find((run) => run.conclusion === 'success' && run.displayTitle.includes(needle));
    return match ? { sha: match.headSha, date: match.createdAt } : { sha: null, date: null, note: 'no successful deploy run found' };
}

const REPO = 'NangoHQ/nango';

// The PR number associated with each commit (the first GitHub reports), keyed by full SHA. Used to
// label feature-branch deploys as "PR #1234". One call per unique SHA, fetched in parallel.
export async function fetchPullRequests(shas: string[]): Promise<Map<string, number>> {
    const prs = new Map<string, number>();
    await Promise.all(
        [...new Set(shas)].map(async (sha) => {
            const r = await $`gh api ${`repos/${REPO}/commits/${sha}/pulls`} --jq ${'.[0].number // ""'}`.nothrow();
            const n = Number(r.stdout.trim());
            if (r.exitCode === 0 && n) prs.set(sha, n);
        })
    );
    return prs;
}
