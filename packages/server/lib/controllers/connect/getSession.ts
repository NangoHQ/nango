import db from '@nangohq/database';
import * as endUserService from '@nangohq/shared';
import { configService, connectUISettingsService, connectionService, getProvider } from '@nangohq/shared';
import { report, requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { GetConnectSession, InternalEndUser } from '@nangohq/types';

// Credentials fields safe to echo to the Connect UI for AWS_SIGV4 vendor pre-seeding.
// Anything outside this allowlist is dropped server-side to avoid leaking pre-seeded
// values (or any forward-compatible additions) to the customer's browser.
const AWS_SIGV4_CREDENTIAL_ECHO_ALLOWLIST = ['role_arn', 'region'] as const;

// connection_config fields safe to hydrate from the existing stored connection on a
// reconnect. external_id is stable across reconnects (the IAM trust policy depends on
// it) so Connect UI should display the value the auth controller will actually use.
// Other stored fields (role_arn, region, service, raw OAuth state, etc.) are excluded
// to prevent leaking arbitrary stored values.
const AWS_SIGV4_RECONNECT_CONNECTION_CONFIG_ALLOWLIST = ['external_id'] as const;

function pickAllowlistedKeys(source: Record<string, unknown> | null | undefined, allowlist: readonly string[]): Record<string, unknown> {
    if (!source) return {};
    const out: Record<string, unknown> = {};
    for (const key of allowlist) {
        if (key in source) {
            out[key] = source[key];
        }
    }
    return out;
}

export const getConnectSession = asyncWrapper<GetConnectSession>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const { connectSession, account, environment, plan } = res.locals;

    let endUser: InternalEndUser | null = null;
    if (connectSession.endUserId) {
        const getEndUser = await endUserService.getEndUser(db.knex, {
            id: connectSession.endUserId,
            accountId: account.id,
            environmentId: environment.id
        });

        if (getEndUser.isErr()) {
            res.status(404).send({ error: { code: 'not_found', message: 'End user not found' } });
            return;
        }
        endUser = getEndUser.value;
    } else if (connectSession.endUser) {
        endUser = connectSession.endUser;
    }

    // Defensive check: end_user can only be skipped when tags were used.
    // This is validated by zod at session creation time, but we keep an explicit guard
    // here to avoid regressions if the validation rules change.
    const tagsArePresent = connectSession.tags !== undefined && connectSession.tags !== null;
    if (!endUser && !tagsArePresent) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'end_user is required unless tags are provided' } });
        return;
    }

    const connectUISettingsResult = await connectUISettingsService.getConnectUISettings(db.knex, environment.id, plan);
    if (connectUISettingsResult.isErr()) {
        // Not critical - report, but don't fail
        report(connectUISettingsResult.error);
    }

    let connectUISettings = connectUISettingsService.getDefaultConnectUISettings();
    if (connectUISettingsResult.isOk() && connectUISettingsResult.value) {
        connectUISettings = connectUISettingsResult.value;
    }

    const endUserData = endUser
        ? {
              id: endUser.endUserId,
              display_name: endUser.displayName || null,
              email: endUser.email || null,
              tags: endUser.tags || null,
              organization: endUser.organization
                  ? {
                        id: endUser.organization.organizationId,
                        display_name: endUser.organization.displayName || null
                    }
                  : null
          }
        : null;

    const data: GetConnectSession['Success']['data'] = {
        endUser: endUserData,
        connectUISettings
    };
    if (connectSession.allowedIntegrations) {
        data.allowed_integrations = connectSession.allowedIntegrations;
    }
    if (connectSession.integrationsConfigDefaults) {
        const entries = await Promise.all(
            Object.entries(connectSession.integrationsConfigDefaults).map(async ([key, value]) => {
                // For AWS_SIGV4, echo only an explicit allowlist of non-sensitive credential
                // fields (role_arn, region). Other auth modes never get credentials echoed
                // because the blob can carry vendor-pre-seeded secrets (OAuth client_secret,
                // refresh_token, apiKey, password) that must not reach the browser.
                const integrationConfig = await configService.getProviderConfig(key, environment.id);
                const provider = integrationConfig ? getProvider(integrationConfig.provider) : null;
                const isAwsSigV4 = provider?.auth_mode === 'AWS_SIGV4';
                const safeCredentials = isAwsSigV4 ? pickAllowlistedKeys(value.credentials, AWS_SIGV4_CREDENTIAL_ECHO_ALLOWLIST) : null;
                return [
                    key,
                    {
                        connection_config: value.connectionConfig,
                        // For debugging reason, it's enforced in the backend
                        authorization_params: value.authorization_params,
                        ...(safeCredentials && Object.keys(safeCredentials).length > 0 ? { credentials: safeCredentials as Record<string, string> } : {})
                    }
                ] as const;
            })
        );
        data.integrations_config_defaults = Object.fromEntries(entries);
    }
    if (connectSession.connectionId) {
        data.isReconnecting = true;

        // Hydrate the existing connection's stable fields so the Connect UI displays what the
        // auth controller will actually use. Limit to AWS_SIGV4 and an explicit allowlist so
        // stored arbitrary connection_config values (subdomain, account identifiers, raw OAuth
        // state, etc.) for other auth modes — or any forward-compatible additions — never
        // accidentally leak through the browser.
        const existing = await connectionService.getConnectionById(connectSession.connectionId);
        if (existing) {
            const existingProviderConfig = await configService.getProviderConfig(existing.provider_config_key, environment.id);
            const existingProvider = existingProviderConfig ? getProvider(existingProviderConfig.provider) : null;
            if (existingProvider?.auth_mode === 'AWS_SIGV4') {
                const key = existing.provider_config_key;
                const hydrated = pickAllowlistedKeys(existing.connection_config as Record<string, unknown>, AWS_SIGV4_RECONNECT_CONNECTION_CONFIG_ALLOWLIST);
                if (Object.keys(hydrated).length > 0) {
                    data.integrations_config_defaults = data.integrations_config_defaults || {};
                    const existingDefaults = data.integrations_config_defaults[key] || {};
                    data.integrations_config_defaults[key] = {
                        ...existingDefaults,
                        connection_config: {
                            ...(existingDefaults.connection_config || {}),
                            ...hydrated
                        }
                    };
                }
            }
        }
    }
    if (connectSession.overrides) {
        data.overrides = connectSession.overrides;
    }

    res.status(200).send({ data });
});
