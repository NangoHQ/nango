/**
 * Drift engine: given a service's currently-deployed SHA, work out how far behind master it is
 * w.r.t. commits that actually touch that service. Uses local git (the CLI runs in a checkout);
 * a future backend port would swap these git calls for the GitHub compare API but keep the logic.
 */
import { $ } from 'zx';

import { affectedByFiles } from './services.ts';

import type { MappingContext, Reason, ServiceDef } from './services.ts';

$.verbose = false;

const MASTER = 'origin/master';

export interface CommitInfo {
    sha: string;
    shortSha: string;
    date: string; // ISO
    author: string;
    subject: string;
    reason: Reason; // how this commit affects the service in question
}

export type DeployStatus =
    | 'on-master' // deployed SHA is an ancestor of master — the normal case
    | 'feature-branch' // deployed SHA has commits master doesn't (e.g. dev deployed from a branch)
    | 'orphaned'; // deployed SHA not found in the repo (deleted/GC'd branch)

export interface Drift {
    status: DeployStatus;
    /** For feature-branch deploys: where the branch forked from master. Drift is measured from here. */
    mergeBase?: string;
    /** Commits affecting this service that master has but the deploy doesn't, newest first. */
    undeployed: CommitInfo[];
}

/** Refresh origin/master so drift is measured against the latest. */
export async function ensureFetched(): Promise<void> {
    await $`git fetch origin master --quiet`.nothrow();
}

/**
 * Fetch any deployed commits not present locally, in one pass, so callers can then compute drift
 * concurrently without each spawning its own (lock-contending) `git fetch`.
 */
export async function prefetchCommits(shas: string[]): Promise<void> {
    const missing: string[] = [];
    for (const sha of shas) {
        if (!(await commitExists(sha))) missing.push(sha);
    }
    if (missing.length === 0) return;
    const combined = await $`git fetch origin ${missing} --quiet`.nothrow().quiet();
    if (combined.exitCode !== 0) {
        // Some SHA is unfetchable (e.g. a deleted branch) — fetch the rest individually.
        for (const sha of missing) await $`git fetch origin ${sha} --quiet`.nothrow().quiet();
    }
}

async function commitExists(sha: string): Promise<boolean> {
    const r = await $`git cat-file -e ${`${sha}^{commit}`}`.nothrow().quiet();
    return r.exitCode === 0;
}

async function isAncestorOfMaster(sha: string): Promise<boolean> {
    const r = await $`git merge-base --is-ancestor ${sha} ${MASTER}`.nothrow().quiet();
    return r.exitCode === 0;
}

// Parse `git log --name-only` into commits, keeping only those that affect `service`.
// A NUL prefix delimits each commit record so blank lines in the file list can't confuse parsing.
async function commitsAffecting(range: string, service: ServiceDef, ctx: MappingContext): Promise<CommitInfo[]> {
    const out = await $`git log --no-renames --name-only --pretty=format:${'%x00%H%x1f%cI%x1f%an%x1f%s'} ${range}`.text();
    const result: CommitInfo[] = [];
    for (const record of out.split('\0')) {
        const trimmed = record.replace(/^\n/, '');
        if (!trimmed.trim()) continue;
        const lines = trimmed.split('\n');
        const [sha, date, author, subject] = (lines[0] ?? '').split('\x1f');
        if (!sha) continue;
        const files = lines
            .slice(1)
            .map((l) => l.trim())
            .filter(Boolean);
        const hit = affectedByFiles(files, ctx).find((a) => a.service.key === service.key);
        if (hit) {
            result.push({ sha, shortSha: sha.slice(0, 9), date: date ?? '', author: author ?? '', subject: subject ?? '', reason: hit.reason });
        }
    }
    return result; // git log is newest-first
}

export async function computeDrift(deployedSha: string, service: ServiceDef, ctx: MappingContext): Promise<Drift> {
    if (!(await commitExists(deployedSha))) {
        // The SHA may belong to a branch we haven't fetched; try once before giving up.
        await $`git fetch origin ${deployedSha} --quiet`.nothrow().quiet();
    }
    if (!(await commitExists(deployedSha))) {
        return { status: 'orphaned', undeployed: [] };
    }

    if (await isAncestorOfMaster(deployedSha)) {
        return { status: 'on-master', undeployed: await commitsAffecting(`${deployedSha}..${MASTER}`, service, ctx) };
    }

    const mergeBase = (await $`git merge-base ${deployedSha} ${MASTER}`.text()).trim();
    return { status: 'feature-branch', mergeBase, undeployed: await commitsAffecting(`${mergeBase}..${MASTER}`, service, ctx) };
}

// The latest commit on master that directly touches this service's own package. This is
// env-independent ("the latest version with <service> changes"), unlike per-env drift.
export async function latestDirectCommit(service: ServiceDef): Promise<CommitInfo | null> {
    const out = await $`git log -1 --no-renames --pretty=format:${'%H%x1f%cI%x1f%an%x1f%s'} ${MASTER} -- ${service.dir}`.text();
    const [sha, date, author, subject] = out.split('\x1f');
    if (!sha) return null;
    return { sha, shortSha: sha.slice(0, 9), date: date ?? '', author: author ?? '', subject: subject ?? '', reason: 'direct' };
}
