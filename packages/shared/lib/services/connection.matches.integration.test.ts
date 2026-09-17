import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

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

        await createConfigSeed(env, 'notion-retired', 'notion');
        await createConnectionSeed({ env, provider: 'notion-retired', connectionId: 'notion-retired-1', tags: { tenant: 'acme' } });
        await db.knex('_nango_configs').where({ environment_id: env.id, unique_key: 'notion-retired' }).update({ deleted: true });
    });

    it('ignores connections on a deleted integration', async () => {
        const groups = await connectionService.groupConnectionMatchesByIntegration({
            environmentId: env.id,
            tagSelectors: [{ tenant: 'acme' }],
            pinnedConnections: [{ integrationId: 'notion-retired', connectionId: 'notion-retired-1' }],
            candidateSampleSize: 10
        });

        expect(groups.map((group) => group.integration_id).sort()).toStrictEqual(['notion', 'slack']);

        const existing = await connectionService.findExistingConnections({
            environmentId: env.id,
            connections: [{ integrationId: 'notion-retired', connectionId: 'notion-retired-1' }]
        });

        expect(existing).toStrictEqual([]);
    });

    describe('groupConnectionMatchesByIntegration', () => {
        it('counts matches per integration and samples the candidates', async () => {
            const groups = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [{ tenant: 'acme' }],
                pinnedConnections: [],
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
                pinnedConnections: [],
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
                pinnedConnections: [],
                candidateSampleSize: 10
            });

            expect(unionGroups.flatMap((group) => group.candidates.map((candidate) => candidate.connection_id)).sort()).toStrictEqual([
                'notion-marketing',
                'slack-other-tenant'
            ]);

            const conjunction = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [{ tenant: 'acme', workspace: 'eng' }],
                pinnedConnections: [],
                candidateSampleSize: 10
            });

            expect(conjunction.flatMap((group) => group.candidates.map((candidate) => candidate.connection_id))).toStrictEqual(['notion-eng']);
        });

        it('returns nothing for a selector that matches no connection', async () => {
            const groups = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [{ tenant: 'nobody' }],
                pinnedConnections: [],
                candidateSampleSize: 10
            });

            expect(groups).toStrictEqual([]);
        });

        it('returns nothing when there are no selectors', async () => {
            const groups = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [],
                pinnedConnections: [],
                candidateSampleSize: 10
            });

            expect(groups).toStrictEqual([]);
        });
    });

    describe('pinned connections', () => {
        it('returns a pinned connection that the sample would otherwise have cut', async () => {
            const groups = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [{ tenant: 'acme' }],
                pinnedConnections: [{ integrationId: 'notion', connectionId: 'notion-marketing' }],
                candidateSampleSize: 1
            });

            const notion = groups.find((match) => match.integration_id === 'notion');

            expect(notion?.match_count).toBe(2);
            expect(notion?.candidates.map((candidate) => candidate.connection_id).sort()).toStrictEqual(['notion-eng', 'notion-marketing']);
        });

        it('does not return a pinned connection the selectors exclude', async () => {
            const groups = await connectionService.groupConnectionMatchesByIntegration({
                environmentId: env.id,
                tagSelectors: [{ tenant: 'acme' }],
                pinnedConnections: [{ integrationId: 'slack', connectionId: 'slack-other-tenant' }],
                candidateSampleSize: 10
            });

            const slack = groups.find((match) => match.integration_id === 'slack');

            expect(slack?.candidates.map((candidate) => candidate.connection_id)).toStrictEqual(['slack-only']);
        });
    });

    describe('findExistingConnections', () => {
        it('finds several connections in one query, ignoring tags', async () => {
            const found = await connectionService.findExistingConnections({
                environmentId: env.id,
                connections: [
                    { integrationId: 'notion', connectionId: 'notion-eng' },
                    { integrationId: 'slack', connectionId: 'slack-other-tenant' }
                ]
            });

            expect(found.map((row) => row.candidate.connection_id).sort()).toStrictEqual(['notion-eng', 'slack-other-tenant']);
            expect(found.find((row) => row.integration_id === 'notion')?.candidate.tags).toStrictEqual({ tenant: 'acme', workspace: 'eng' });
        });

        it('omits a connection that does not exist, and one under the wrong integration', async () => {
            const found = await connectionService.findExistingConnections({
                environmentId: env.id,
                connections: [
                    { integrationId: 'notion', connectionId: 'does-not-exist' },
                    { integrationId: 'slack', connectionId: 'notion-eng' }
                ]
            });

            expect(found).toStrictEqual([]);
        });

        it('returns nothing for an empty list, without querying', async () => {
            expect(await connectionService.findExistingConnections({ environmentId: env.id, connections: [] })).toStrictEqual([]);
        });

        it('does not cross environments', async () => {
            const otherEnv = await createEnvironmentSeed();

            const found = await connectionService.findExistingConnections({
                environmentId: otherEnv.id,
                connections: [{ integrationId: 'notion', connectionId: 'notion-eng' }]
            });

            expect(found).toStrictEqual([]);
        });
    });
});
