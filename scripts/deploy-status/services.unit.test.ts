import { describe, expect, it } from 'vitest';

import { affectedByFile, affectedByFiles, buildMappingContext } from './services.ts';

const ctx = buildMappingContext();

function reasons(files: string[]): Record<string, string> {
    return Object.fromEntries(affectedByFiles(files, ctx).map((a) => [a.service.key, a.reason]));
}

describe('service mapping', () => {
    it('classifies a change to a service package as direct', () => {
        expect(reasons(['packages/server/lib/server.ts'])).toEqual({ server: 'direct' });
    });

    it('treats a shared backend dep as via-shared for backend services but not the UIs', () => {
        const r = reasons(['packages/utils/lib/x.ts']);
        expect(r['server']).toBe('via-shared');
        expect(r['jobs']).toBe('via-shared');
        expect(r['app_ui']).toBeUndefined();
        expect(r['connect_ui']).toBeUndefined();
    });

    it('maps design-system only to app_ui (not backend, not connect_ui)', () => {
        expect(reasons(['packages/design-system/src/x.ts'])).toEqual({ app_ui: 'via-shared' });
    });

    it('maps a runner change to runner (direct) + jobs and lambda (via-shared), resolving the file: dep name mismatch', () => {
        // lambda-runner depends on packages/runner via "@nangohq/runner": "file:../runner",
        // but the package is named "@nangohq/nango-runner" — path resolution must still catch it.
        const r = reasons(['packages/runner/lib/x.ts']);
        expect(r['runner']).toBe('direct');
        expect(r['jobs']).toBe('via-shared');
        expect(r['lambda']).toBe('via-shared');
    });

    it('maps a types change to every deployable service', () => {
        expect(Object.keys(reasons(['packages/types/lib/index.ts']))).toHaveLength(9);
    });

    it('treats a root build input as via-shared for every service', () => {
        const r = reasons(['Dockerfile']);
        expect(Object.keys(r)).toHaveLength(9);
        expect(Object.values(r).every((v) => v === 'via-shared')).toBe(true);
    });

    it('ignores package-lock.json (too noisy to invalidate all services)', () => {
        expect(affectedByFile('package-lock.json', ctx)).toEqual([]);
    });

    it('ignores paths that map to no service', () => {
        expect(affectedByFile('docs/x.md', ctx)).toEqual([]);
        expect(affectedByFile('.github/workflows/deploy.yaml', ctx)).toEqual([]);
    });

    it('lets a direct change win over via-shared when both apply', () => {
        const r = reasons(['packages/orchestrator/lib/x.ts', 'packages/server/lib/x.ts']);
        expect(r['orchestrator']).toBe('direct');
        expect(r['server']).toBe('direct');
    });
});
