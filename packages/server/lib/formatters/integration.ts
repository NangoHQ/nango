import { awsSigV4Client } from '@nangohq/shared';
import { basePublicUrl } from '@nangohq/utils';

import type { ApiIntegration, ApiPublicIntegration, ApiPublicIntegrationInclude, AwsSigV4TemplateSummary, IntegrationConfig, Provider } from '@nangohq/types';

export function integrationToApi(data: IntegrationConfig): ApiIntegration {
    return {
        id: data.id,
        unique_key: data.unique_key,
        provider: data.provider,
        oauth_client_id: data.shared_credentials_id ? '' : data.oauth_client_id,
        oauth_client_secret: data.shared_credentials_id ? '' : data.oauth_client_secret,
        oauth_scopes: data.oauth_scopes,
        environment_id: data.environment_id,
        app_link: data.app_link,
        custom: data.custom,
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString(),
        missing_fields: data.missing_fields,
        display_name: data.display_name,
        forward_webhooks: data.forward_webhooks === undefined ? true : data.forward_webhooks,
        shared_credentials_id: data.shared_credentials_id
    };
}

function normalizeAwsSigV4Templates(raw: any): AwsSigV4TemplateSummary[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const templates: AwsSigV4TemplateSummary[] = [];
    for (const template of raw) {
        if (!template || typeof template !== 'object') {
            continue;
        }
        const id = typeof template.id === 'string' ? template.id.trim() : '';
        if (!id) {
            continue;
        }
        const normalized: AwsSigV4TemplateSummary = { id };
        if (typeof template.label === 'string') {
            normalized.label = template.label;
        }
        if (typeof template.description === 'string') {
            normalized.description = template.description;
        }
        if (typeof template.stackName === 'string') {
            normalized.stack_name = template.stackName;
        } else if (typeof template.stack_name === 'string') {
            normalized.stack_name = template.stack_name;
        }
        if (typeof template.templateUrl === 'string') {
            normalized.template_url = template.templateUrl;
        } else if (typeof template.template_url === 'string') {
            normalized.template_url = template.template_url;
        }
        if (typeof template.templateBody === 'string') {
            normalized.template_body = template.templateBody;
        } else if (typeof template.template_body === 'string') {
            normalized.template_body = template.template_body;
        }
        if (template.parameters && typeof template.parameters === 'object') {
            const params: Record<string, string> = {};
            for (const [key, value] of Object.entries(template.parameters)) {
                if (typeof key === 'string' && typeof value === 'string') {
                    params[key] = value;
                }
            }
            if (Object.keys(params).length > 0) {
                normalized.parameters = params;
            }
        }
        templates.push(normalized);
    }
    return templates;
}

export function integrationToPublicApi({
    integration,
    include,
    provider
}: {
    integration: IntegrationConfig;
    provider: Provider;
    include?: ApiPublicIntegrationInclude;
}): ApiPublicIntegration {
    let awsSigV4: ApiPublicIntegration['aws_sigv4'];
    const rawSigConfig = integration.custom?.[awsSigV4Client.AWS_SIGV4_CUSTOM_KEY];
    if (rawSigConfig) {
        try {
            const parsed = JSON.parse(rawSigConfig);
            if (parsed && (parsed.instructions || parsed.templates)) {
                awsSigV4 = {};
                if (parsed.instructions) {
                    awsSigV4.instructions = parsed.instructions;
                }
                const templates = normalizeAwsSigV4Templates(parsed.templates);
                if (templates.length > 0) {
                    awsSigV4.templates = templates;
                }
            }
        } catch {
            // ignore malformed JSON
        }
    }

    return {
        unique_key: integration.unique_key,
        provider: integration.provider,
        display_name: integration.display_name || provider.display_name,
        logo: `${basePublicUrl}/images/template-logos/${integration.provider}.svg`,
        ...(awsSigV4 ? { aws_sigv4: awsSigV4 } : {}),
        ...include,
        forward_webhooks: integration.forward_webhooks === undefined ? true : integration.forward_webhooks,
        created_at: integration.created_at.toISOString(),
        updated_at: integration.updated_at.toISOString()
    };
}
