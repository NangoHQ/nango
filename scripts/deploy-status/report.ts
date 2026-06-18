/**
 * Gather the deploy-status data once, as plain structured values. This is the single source the
 * terminal CLI, the snapshot producer, and (via the snapshot) the Slack renderer all consume.
 * Timestamps are absolute ISO strings — relative formatting is left to each renderer so it stays
 * accurate at display time.
 */
import { computeDrift, ensureFetched, latestDirectCommit, prefetchCommits } from './engine.ts';
import { SERVICES, buildMappingContext } from './services.ts';
import { ENVIRONMENTS, fetchDeployRuns, fetchPullRequests, latestDeploy } from './sources.ts';

import type { CommitInfo, DeployStatus } from './engine.ts';

export interface ServiceStatus {
    service: string; // service key
    deployedSha: string | null;
    deployedAt: string | null; // ISO timestamp of the deploy
    pr: number | null; // PR for a feature-branch deploy, if resolved
    status: DeployStatus | null;
    directBehind: number | null; // commits directly touching the service, undeployed
    totalBehind: number | null; // all undeployed commits affecting it (direct + via-shared)
    latestDirect: string | null; // sha of the latest commit on master touching the service
    undeployed: CommitInfo[];
}

export interface EnvStatus {
    env: string;
    services: ServiceStatus[];
}

export async function collectStatus(opts: { envName?: string; serviceKey?: string } = {}): Promise<EnvStatus[]> {
    const envs = ENVIRONMENTS.filter((e) => !opts.envName || e.name === opts.envName);
    const services = SERVICES.filter((s) => !opts.serviceKey || s.key === opts.serviceKey);
    if (envs.length === 0) throw new Error(`Unknown env "${opts.envName}". Valid: ${ENVIRONMENTS.map((e) => e.name).join(', ')}`);
    if (services.length === 0) throw new Error(`Unknown service "${opts.serviceKey}". Valid: ${SERVICES.map((s) => s.key).join(', ')}`);

    await ensureFetched();
    const ctx = buildMappingContext();

    let runs: Awaited<ReturnType<typeof fetchDeployRuns>> = [];
    try {
        runs = await fetchDeployRuns();
    } catch (err) {
        // Without runs, every service reads as unknown; surface the reason but don't crash.
        console.error(String(err));
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

    const featureBranchShas = byEnv.flatMap(({ rows }) =>
        rows.filter((r) => r.drift?.status === 'feature-branch' && r.ref.sha).map((r) => r.ref.sha as string)
    );
    const prNumbers = await fetchPullRequests(featureBranchShas);

    return byEnv.map(({ env, rows }) => ({
        env: env.name,
        services: rows.map(
            ({ service, ref, drift }): ServiceStatus => ({
                service: service.key,
                deployedSha: ref.sha,
                deployedAt: ref.date,
                pr: ref.sha ? (prNumbers.get(ref.sha) ?? null) : null,
                status: drift?.status ?? null,
                directBehind: drift ? drift.undeployed.filter((c) => c.reason === 'direct').length : null,
                totalBehind: drift?.undeployed.length ?? null,
                latestDirect: latestByService.get(service.key)?.sha ?? null,
                undeployed: drift?.undeployed ?? []
            })
        )
    }));
}
