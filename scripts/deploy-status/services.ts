import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// scripts/deploy-status -> repo root
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');

export interface ServiceDef {
    /** Value accepted by the `service` input of .github/workflows/deploy.yaml */
    key: string;
    /** Repo-relative package directory, e.g. "packages/server" */
    dir: string;
}

// The deployable units, keyed by the exact `service` values deploy.yaml accepts. Replit is out of scope.
export const SERVICES: ServiceDef[] = [
    { key: 'server', dir: 'packages/server' },
    { key: 'jobs', dir: 'packages/jobs' },
    { key: 'persist', dir: 'packages/persist' },
    { key: 'orchestrator', dir: 'packages/orchestrator' },
    { key: 'metering', dir: 'packages/metering' },
    { key: 'runner', dir: 'packages/runner' },
    { key: 'lambda', dir: 'packages/lambda-runner' },
    { key: 'connect_ui', dir: 'packages/connect-ui' },
    { key: 'app_ui', dir: 'packages/webapp' }
];

// Files at the repo root whose change rebuilds the image / every workspace, so they
// invalidate every deployable service. Matched exactly against the repo-relative path.
// package-lock.json is deliberately excluded: it churns on nearly every dependency bump,
// so flagging all services on every lockfile change is too noisy to be useful.
const ROOT_BUILD_INPUTS = new Set([
    'Dockerfile',
    'Dockerfile.self_hosted',
    'package.json',
    'tsconfig.json',
    'tsconfig.build.json',
    'tsconfig.docker.json',
    'scripts/build_docker.sh',
    'scripts/build_docker_self_hosted.sh'
]);

export type Reason = 'direct' | 'via-shared';

export interface Affected {
    service: ServiceDef;
    /** "direct" = the service's own package changed; "via-shared" = a dependency (or build input) changed. */
    reason: Reason;
}

export interface MappingContext {
    /** service key -> set of package dirs in that service's transitive internal-dependency closure (excludes its own dir). */
    closures: Map<string, Set<string>>;
}

interface PackageNode {
    name: string;
    dir: string;
    internalDepDirs: string[];
}

interface RawPackageJson {
    name: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

function readPackageJson(filePath: string): RawPackageJson {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as RawPackageJson;
}

// Load every workspace package under packages/ and resolve its internal deps to dirs.
// Internal deps are linked with `file:../<dir>` (e.g. lambda-runner -> "file:../runner"),
// which npm resolves by PATH, not by name — and the dep key can differ from the target's
// real package name (lambda-runner lists "@nangohq/runner" for a package named
// "@nangohq/nango-runner"). So resolve `file:` by path first, and fall back to name.
function loadPackages(): Map<string, PackageNode> {
    const byDir = new Map<string, { name: string; deps: Record<string, string> }>();
    for (const entry of fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const pkgJsonPath = path.join(PACKAGES_DIR, entry.name, 'package.json');
        if (!fs.existsSync(pkgJsonPath)) continue;
        const json = readPackageJson(pkgJsonPath);
        byDir.set(`packages/${entry.name}`, { name: json.name, deps: { ...json.dependencies, ...json.devDependencies } });
    }

    const nameToDir = new Map<string, string>();
    for (const [dir, { name }] of byDir) nameToDir.set(name, dir);

    const nodes = new Map<string, PackageNode>();
    for (const [dir, { name, deps }] of byDir) {
        const internalDepDirs = new Set<string>();
        for (const [depKey, spec] of Object.entries(deps)) {
            if (typeof spec === 'string' && spec.startsWith('file:')) {
                // path.join keeps forward slashes on posix; resolve relative to the depending package's dir.
                const target = path.join(dir, spec.slice('file:'.length));
                if (byDir.has(target)) {
                    internalDepDirs.add(target);
                    continue;
                }
            }
            const byName = nameToDir.get(depKey);
            if (byName) internalDepDirs.add(byName);
        }
        nodes.set(dir, { name, dir, internalDepDirs: [...internalDepDirs] });
    }
    return nodes;
}

// Transitive closure of internal dependency dirs, excluding the start dir itself.
function transitiveClosure(startDir: string, nodes: Map<string, PackageNode>): Set<string> {
    const seen = new Set<string>();
    const stack = [...(nodes.get(startDir)?.internalDepDirs ?? [])];
    while (stack.length) {
        const dir = stack.pop()!;
        if (seen.has(dir)) continue;
        seen.add(dir);
        for (const dep of nodes.get(dir)?.internalDepDirs ?? []) {
            if (!seen.has(dep)) stack.push(dep);
        }
    }
    return seen;
}

/** Build the mapping context once (reads package.json files), then reuse for many classify calls. */
export function buildMappingContext(): MappingContext {
    const nodes = loadPackages();
    const closures = new Map<string, Set<string>>();
    for (const svc of SERVICES) {
        closures.set(svc.key, transitiveClosure(svc.dir, nodes));
    }
    return { closures };
}

function packageDirOf(filePath: string): string | null {
    const match = filePath.match(/^packages\/[^/]+/);
    return match ? match[0] : null;
}

/** Which services a single changed file affects, and whether directly or via a shared dependency. */
export function affectedByFile(filePath: string, ctx: MappingContext): Affected[] {
    if (ROOT_BUILD_INPUTS.has(filePath)) {
        // A build input changed: rebuilds everything, so every service is (conservatively) affected.
        return SERVICES.map((service) => ({ service, reason: 'via-shared' as const }));
    }

    const pkgDir = packageDirOf(filePath);
    if (!pkgDir) return []; // docs/, .github/, etc. — no service redeploy implied

    const result: Affected[] = [];
    for (const service of SERVICES) {
        if (pkgDir === service.dir) {
            result.push({ service, reason: 'direct' });
        } else if (ctx.closures.get(service.key)!.has(pkgDir)) {
            result.push({ service, reason: 'via-shared' });
        }
    }
    return result;
}

/** Aggregate affected services across many changed files. "direct" wins over "via-shared" per service. */
export function affectedByFiles(filePaths: string[], ctx: MappingContext): Affected[] {
    const byKey = new Map<string, Affected>();
    for (const filePath of filePaths) {
        for (const affected of affectedByFile(filePath, ctx)) {
            const existing = byKey.get(affected.service.key);
            if (!existing || (existing.reason === 'via-shared' && affected.reason === 'direct')) {
                byKey.set(affected.service.key, affected);
            }
        }
    }
    // Stable order matching SERVICES declaration.
    return SERVICES.map((s) => byKey.get(s.key)).filter((a): a is Affected => Boolean(a));
}
