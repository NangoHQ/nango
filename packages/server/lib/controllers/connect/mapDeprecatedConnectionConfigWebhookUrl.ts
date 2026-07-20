import { webhookUrlSchema } from '../../helpers/validation.js';

import type { ConnectSessionInput } from '@nangohq/types';
import type * as z from 'zod';

type BodyWithDeprecatedWebhookUrl = {
    webhook_url_override?: string | undefined;
    integrations_config_defaults?: ConnectSessionInput['integrations_config_defaults'];
};

/**
 * Backward-compat for the deprecated
 * `integrations_config_defaults.<provider>.connection_config.webhook_url` field.
 *
 * - Validates and strips nested `webhook_url` so it never lands in connection_config
 * - Hoists the first non-empty nested value onto top-level `webhook_url_override`
 *   when that field was not already set
 * - Explicit `webhook_url_override` (including empty string) always wins
 */
export function mapDeprecatedConnectionConfigWebhookUrl<T extends BodyWithDeprecatedWebhookUrl>(
    body: T
): { ok: true; body: T } | { ok: false; issues: z.core.$ZodIssue[] } {
    const defaults = body.integrations_config_defaults;
    if (!defaults) {
        return { ok: true, body };
    }

    const issues: z.core.$ZodIssue[] = [];
    const deprecatedUrls: string[] = [];
    const integrations_config_defaults: NonNullable<ConnectSessionInput['integrations_config_defaults']> = {};

    for (const [integrationKey, value] of Object.entries(defaults)) {
        const connectionConfig = value.connection_config;
        if (!connectionConfig || !('webhook_url' in connectionConfig)) {
            integrations_config_defaults[integrationKey] = value;
            continue;
        }

        const { webhook_url: deprecatedWebhookUrl, ...restConnectionConfig } = connectionConfig;
        const parsed = webhookUrlSchema.safeParse(deprecatedWebhookUrl);
        if (!parsed.success) {
            for (const issue of parsed.error.issues) {
                issues.push({
                    ...issue,
                    message: `${issue.message}. Note: connection_config.webhook_url is deprecated; use top-level webhook_url_override instead.`,
                    path: ['integrations_config_defaults', integrationKey, 'connection_config', 'webhook_url', ...issue.path]
                });
            }
            continue;
        }

        if (typeof parsed.data === 'string' && parsed.data !== '') {
            deprecatedUrls.push(parsed.data);
        }

        integrations_config_defaults[integrationKey] = {
            ...value,
            connection_config: Object.keys(restConnectionConfig).length > 0 ? restConnectionConfig : undefined
        };
    }

    if (issues.length > 0) {
        return { ok: false, issues };
    }

    return {
        ok: true,
        body: {
            ...body,
            webhook_url_override: body.webhook_url_override !== undefined ? body.webhook_url_override : deprecatedUrls[0],
            integrations_config_defaults
        }
    };
}
