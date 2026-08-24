import { beforeAll, describe, expect, it } from 'vitest';

import { multipleMigrations } from '@nangohq/database';

import { createConfigSeed } from '../seeders/config.seeder.js';
import { createConnectionSeed } from '../seeders/connection.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';
import connectionService from './connection.service.js';

import type { DBEnvironment } from '@nangohq/types';

describe('connection matching by tag selectors', () => {
    let env: DBEnvironment;

    beforeAll(async () => {
        await multipleMigrations();
        env = await createEnvironmentSeed();
        await createConfigSeed(env, 'notion', 'notion');
        await createConfigSeed(env, 'slack', 'slack');

        await createConnectionSeed({ env, provider: 'notion', connectionId: 'notion-marketing', tags: { tenant: 'acme', workspace: 'marketing' } });
        await createConnectionSeed({ env, provider: 'notion', connectionId: 'notion-eng', tags: { tenant: 'acme', workspace: 'eng' } });
        await createConnectionSeed({ env, provider: 'slack', connectionId: 'slack-only', tags: { tenant: 'acme' } });
        await createConnectionSeed({ env, provider: 'slack', connectionId: 'slack-other-tenant', tags: { tenant: 'globex' } });
    });

    describe('groupConnectionMatchesByIntegration', () => {
        it('counts matches per integration and samples the candidates', async () => {
            const groups = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [{ tenant: 'acme' }],
                candidateSampleSize: 10
            });

            const byIntegration = new Map(groups.map((group) => [group.integration_id, group]));

            expect(byIntegration.get('notion')?.match_count).toBe(2);
            expect(byIntegration.get('notion')?.provider).toBe('notion');
            expect(
                byIntegration
                    .get('notion')
                    ?.candidates.map((candidate) => candidate.connection_id)
                    .sort()
            ).toStrictEqual(['notion-eng', 'notion-marketing']);

            expect(byIntegration.get('slack')?.match_count).toBe(1);
            expect(byIntegration.get('slack')?.candidates).toHaveLength(1);
            expect(byIntegration.get('slack')?.candidates[0]?.connection_id).toBe('slack-only');
            expect(byIntegration.get('slack')?.candidates[0]?.tags).toStrictEqual({ tenant: 'acme' });
        });

        it('keeps the true count while bounding the candidates listed', async () => {
            const groups = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [{ tenant: 'acme' }],
                candidateSampleSize: 1
            });

            const notion = groups.find((match) => match.integration_id === 'notion');

            expect(notion?.match_count).toBe(2);
            expect(notion?.candidates).toHaveLength(1);
        });

        it('ORs the selectors together and matches all tags within one selector', async () => {
            const unionGroups = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [{ workspace: 'marketing' }, { tenant: 'globex' }],
                candidateSampleSize: 10
            });

            expect(unionGroups.flatMap((group) => group.candidates.map((candidate) => candidate.connection_id)).sort()).toStrictEqual([
                'notion-marketing',
                'slack-other-tenant'
            ]);

            const conjunction = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [{ tenant: 'acme', workspace: 'eng' }],
                candidateSampleSize: 10
            });

            expect(conjunction.flatMap((group) => group.candidates.map((candidate) => candidate.connection_id))).toStrictEqual(['notion-eng']);
        });

        it('returns nothing for a selector that matches no connection', async () => {
            const groups = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [{ tenant: 'nobody' }],
                candidateSampleSize: 10
            });

            expect(groups).toStrictEqual([]);
        });

        it('returns nothing when there are no selectors', async () => {
            const groups = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [],
                candidateSampleSize: 10
            });

            expect(groups).toStrictEqual([]);
        });
    });

    describe('findConnectionMatchingSelectors', () => {
        it('finds a connection that matches the selectors', async () => {
            const row = await connectionService.findConnectionMatchingSelectors({
                environmentId: env.id,
                integrationId: 'notion',
                connectionId: 'notion-eng',
                tagSelectors: [{ tenant: 'acme' }]
            });

            expect(row?.integration_id).toBe('notion');
            expect(row?.provider).toBe('notion');
            expect(row?.candidate.connection_id).toBe('notion-eng');
            expect(row?.candidate.tags).toStrictEqual({ tenant: 'acme', workspace: 'eng' });
        });

        it('does not find a connection the selectors exclude', async () => {
            const row = await connectionService.findConnectionMatchingSelectors({
                environmentId: env.id,
                integrationId: 'slack',
                connectionId: 'slack-other-tenant',
                tagSelectors: [{ tenant: 'acme' }]
            });

            expect(row).toBeNull();
        });

        it('does not find a connection under the wrong integration', async () => {
            const row = await connectionService.findConnectionMatchingSelectors({
                environmentId: env.id,
                integrationId: 'slack',
                connectionId: 'notion-eng',
                tagSelectors: [{ tenant: 'acme' }]
            });

            expect(row).toBeNull();
        });

        it('checks existence only when there are no selectors', async () => {
            const found = await connectionService.findConnectionMatchingSelectors({
                environmentId: env.id,
                integrationId: 'slack',
                connectionId: 'slack-other-tenant',
                tagSelectors: []
            });
            expect(found?.candidate.connection_id).toBe('slack-other-tenant');

            const missing = await connectionService.findConnectionMatchingSelectors({
                environmentId: env.id,
                integrationId: 'slack',
                connectionId: 'does-not-exist',
                tagSelectors: []
            });
            expect(missing).toBeNull();
        });

        it('does not cross environments', async () => {
            const otherEnv = await createEnvironmentSeed();

            const row = await connectionService.findConnectionMatchingSelectors({
                environmentId: otherEnv.id,
                integrationId: 'notion',
                connectionId: 'notion-eng',
                tagSelectors: []
            });

            expect(row).toBeNull();
        });
    });
});
