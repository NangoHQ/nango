import { isCloud } from '@nangohq/utils';

import type { FeatureFlagsClient } from './client.js';

/** Evaluates a flag on cloud only; self-hosted and BYOC always get `offCloud`. */
function cloudOnly(offCloud: boolean, evaluate: () => Promise<boolean>): Promise<boolean> {
    return isCloud ? evaluate() : Promise.resolve(offCloud);
}

/**
 * Typed facade over the generic OpenFeature client: one named method per flag
 * Nango evaluates, so call sites read `getFlags().isOAuthStateCookieEnforced(accountId)`
 * instead of repeating the flag key, context shape, and default everywhere.
 *
 * Add a method here when you add a flag, the method owns the context mapping
 * (targeting key, properties) and the default so it can't drift across call sites.
 *
 * Separate words in flag keys with dashes, never underscores: the env provider can't
 * tell the two apart.
 */
export function buildFlags(client: FeatureFlagsClient) {
    return {
        /**
         * Whether OAuth callbacks missing the state cookie should be rejected for this account.
         * Default `false`
         */
        isOAuthStateCookieEnforced(accountUuid: string) {
            // targetingKey drives gradual-rollout stickiness (same account => same bucket);
            // accountUuid is exposed as a property so strategies can allow/exclude specific accounts.
            return client.isEnabled('oauth-state-cookie-enforcement', { targetingKey: accountUuid, accountUuid }, false);
        },
        isAttioWebhookDedupeEnabled(accountUuid: string) {
            return client.isEnabled('attio-webhook-dedupe', { targetingKey: accountUuid, accountUuid }, false);
        },
        /**
         * Sets Datadog manual.keep on action execution traces for this environment,
         * raising ingestion priority during stall investigations. Default `false`.
         */
        shouldKeepActionTrace(environmentId: number) {
            return client.isEnabled('action-trace-manual-keep', { targetingKey: String(environmentId), environmentId }, false);
        },
        /**
         * Whether to send sync completion webhooks for this environment and provider.
         * Default `true`.
         */
        shouldSendSyncCompletedWebhook(environmentId: number, providerConfigKey: string) {
            return client.isEnabled(
                'sync-completion-webhook-for-webhook-operation',
                {
                    targetingKey: `${environmentId}:${providerConfigKey}`,
                    environmentId,
                    providerConfigKey
                },
                true
            );
        },
        /** Whether the Gmail webhook can be unverified. */
        allowUnauthorizedGmailWebhook(accountUuid: string) {
            return client.isEnabled('allow-unauthorized-gmail-webhook', { targetingKey: accountUuid, accountUuid }, false);
        },
        /**
         * Whether GitHub App webhooks without an `x-hub-signature-256` header can be processed for
         * this account. Escape hatch for apps set up without the derived webhook secret.
         * Default `false`.
         */
        allowUnauthorizedGithubAppWebhook(accountUuid: string) {
            return client.isEnabled('allow-unauthorized-github-app-webhook', { targetingKey: accountUuid, accountUuid }, false);
        },
        /**
         * Whether Salesforce webhooks can be processed without the Nango webhook secret for this account.
         * Escape hatch for Apex triggers installed before the secret was required. Default `false`.
         */
        allowUnauthorizedSalesforceWebhook(accountUuid: string) {
            return client.isEnabled('allow-unauthorized-salesforce-webhook', { targetingKey: accountUuid, accountUuid }, false);
        },
        /**
         * Whether Microsoft Teams webhooks without a valid Bot Framework token can be processed for this account.
         * Escape hatch while the unverified metric shows who would break. Default `false`.
         */
        allowUnauthorizedMicrosoftTeamsWebhook(accountUuid: string) {
            return client.isEnabled('allow-unauthorized-microsoft-teams-webhook', { targetingKey: accountUuid, accountUuid }, false);
        },
        /**
         * Whether every action is listed and run as enabled for this account.
         * Catalog actions are included, and a deployed action is treated as enabled
         * even when `_nango_sync_configs.enabled` is false. Default `false`.
         */
        hasCatalogTools(accountUuid: string) {
            return client.isEnabled('tools-catalog', { targetingKey: accountUuid, accountUuid }, false);
        },
        /**
         * Whether Airtable webhooks that cannot be verified, because the connection does not store the
         * webhook's `macSecretBase64`, can be processed for this account. Default `false`.
         */
        allowUnauthorizedAirtableWebhook(accountUuid: string) {
            return client.isEnabled('allow-unauthorized-airtable-webhook', { targetingKey: accountUuid, accountUuid }, false);
        },
        isAgentPlaygroundEnabled(accountUuid: string) {
            return client.isEnabled('agent-playground', { targetingKey: accountUuid, accountUuid }, false);
        },
        /**
         * Whether the deprecated `search` query param on GET /connections is still honored for this
         * account. Cloud only: default `false` there, so only accounts allowlisted in Unleash keep it.
         * Always `true` on self-hosted and BYOC.
         */
        isConnectionsSearchParamEnabled(accountUuid: string) {
            return cloudOnly(true, () => client.isEnabled('connections-search-param', { targetingKey: accountUuid, accountUuid }, false));
        },
        /**
         * Whether the deprecated `/v1/*` passthrough (legacy custom endpoint routing for syncs and
         * actions) is still reachable for this account. Cloud only: default `false` there, so only
         * accounts allowlisted in Unleash keep it. Always `true` on self-hosted and BYOC.
         */
        isV1PassthroughEnabled(accountUuid: string) {
            return cloudOnly(true, () => client.isEnabled('v1-passthrough', { targetingKey: accountUuid, accountUuid }, false));
        },
        /**
         * Whether the legacy Connection MCP server is available for this account.
         */
        isConnectionMcpEnabled(accountUuid: string) {
            return client.isEnabled('connection-mcp', { targetingKey: accountUuid, accountUuid }, true);
        }
    };
}

export type Flags = ReturnType<typeof buildFlags>;
