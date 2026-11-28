import db from '@nangohq/database';
import { configService, getProvider, sharedCredentialsService } from '@nangohq/shared';
import { getLogger, nanoid } from '@nangohq/utils';

import { recordIntegrationCreated } from '../../hooks/auditIntegration.js';
import { getOrchestrator } from '../../utils/utils.js';
import { getInstantSetup, needsSetupFields } from '../instantSetup.js';
import integrationService from '../integration.service.js';

import type { PlaygroundContext } from './service.js';
import type { AgentPlaygroundIntegrationSetup, Provider } from '@nangohq/types';

const logger = getLogger('AgentPlayground');

// Older playground integrations carry this prefix, so keep matching it to reuse them.
const LEGACY_PLAYGROUND_PREFIX = 'pg-';

// Expects `integrations` oldest first, as listProviderConfigs returns them.
export function existingIntegrationFor<T extends { unique_key: string; provider: string; missing_fields: string[] }>(
    integrations: T[],
    provider: string
): T | undefined {
    const matching = integrations.filter((integration) => integration.provider === provider);
    const pick = (candidates: T[]) =>
        candidates.find((integration) => integration.unique_key === provider) ??
        candidates.find((integration) => integration.unique_key === `${LEGACY_PLAYGROUND_PREFIX}${provider}`) ??
        candidates[0];
    return pick(matching.filter((integration) => integration.missing_fields.length === 0)) ?? pick(matching);
}

export async function setUpPlaygroundIntegration(
    { environment, account, auditAttribution }: Pick<PlaygroundContext, 'environment' | 'account' | 'auditAttribution'>,
    providerName: string
): Promise<AgentPlaygroundIntegrationSetup> {
    const provider = getProvider(providerName);
    const base = { provider: providerName, ...(provider && { displayName: provider.display_name }) };

    // Read the primary: on a stale replica read, the create below adds a duplicate.
    const existing = existingIntegrationFor(await configService.listProviderConfigs(db.knex, environment.id), providerName);
    if (existing) {
        return { ...base, integrationId: existing.unique_key, outcome: existing.missing_fields.length > 0 ? 'missing_credentials' : 'existing' };
    }

    const sharedCredentials = await sharedCredentialsService.getLatestSharedCredentialsByName(providerName);
    if (sharedCredentials.isErr()) {
        logger.error(`Agent Playground could not load the ${providerName} OAuth app: ${sharedCredentials.error.message}`);
        return { ...base, outcome: 'not_created' };
    }
    if (!provider) {
        return { ...base, outcome: 'not_created' };
    }
    const instantSetup = getInstantSetup(provider, Boolean(sharedCredentials.value?.enabled));
    if (!instantSetup) {
        return { ...base, outcome: needsSetupFields(provider) ? 'needs_setup' : 'needs_developer_app' };
    }
    // Production integrations stay under the user's control, so the user adds them with one click on the card.
    if (environment.is_production) {
        return { ...base, outcome: 'needs_confirmation' };
    }

    const useSharedCredentials = instantSetup === 'nango-managed-app';
    const created = await createPlaygroundIntegration({ environment, account, providerName, provider, useSharedCredentials });
    if (!created) {
        return { ...base, outcome: 'not_created' };
    }
    if (created.inserted && auditAttribution) {
        await recordIntegrationCreated({
            integrationId: created.integrationId,
            displayName: provider.display_name,
            provider: providerName,
            account,
            environment,
            auditAttribution
        });
    }
    return { ...base, integrationId: created.integrationId, outcome: 'created', usesSharedCredentials: useSharedCredentials };
}

async function createPlaygroundIntegration({
    environment,
    account,
    providerName,
    provider,
    useSharedCredentials
}: Pick<PlaygroundContext, 'environment' | 'account'> & {
    providerName: string;
    provider: Provider;
    useSharedCredentials: boolean;
}): Promise<{ integrationId: string; inserted: boolean } | null> {
    const integrationId = providerName;
    const create = (uniqueKey: string) =>
        integrationService.create({
            environmentId: environment.id,
            provider: providerName,
            uniqueKey,
            credentialSource: useSharedCredentials ? 'nango' : 'own',
            displayName: provider.display_name,
            environment,
            team: account
        });
    let result = await create(integrationId);
    if (result.isErr()) {
        // A concurrent request that inserted the same key first makes this one fail on the unique constraint.
        const concurrent = existingIntegrationFor(await configService.listProviderConfigs(db.knex, environment.id), providerName);
        if (concurrent) {
            return { integrationId: concurrent.unique_key, inserted: false };
        }
        if (result.error.code === 'integration_exists') {
            result = await create(`${integrationId}-${nanoid(4).toLowerCase()}`);
        }
    }
    if (result.isErr()) {
        logger.error(`Agent Playground could not create the ${providerName} integration: ${result.error.message}`);
        return null;
    }
    const created = result.value.integration;
    if (created.unique_key === integrationId || !created.id) {
        return { integrationId: created.unique_key, inserted: true };
    }

    // Keep our own row in the list: concurrent requests must all pick the same winner, or each deletes its own.
    const winner = existingIntegrationFor(await configService.listProviderConfigs(db.knex, environment.id), providerName);
    if (!winner || winner.unique_key === created.unique_key) {
        return { integrationId: created.unique_key, inserted: true };
    }
    await configService.deleteProviderConfig({
        id: created.id,
        environmentId: environment.id,
        providerConfigKey: created.unique_key,
        orchestrator: getOrchestrator()
    });
    return { integrationId: winner.unique_key, inserted: false };
}
