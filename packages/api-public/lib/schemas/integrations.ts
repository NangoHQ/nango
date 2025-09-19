import * as z from 'zod';

import { basePublicUrl } from '@nangohq/utils';

import type { IntegrationConfig } from '@nangohq/types';

export const schemaIntegration = z.strictObject({
    uniqueName: z.string(),
    displayName: z.string(),
    provider: z.string(),
    logoUrl: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime()
});

export type APIIntegration = z.infer<typeof schemaIntegration>;

export function formatIntegration(integration: IntegrationConfig): APIIntegration {
    return {
        uniqueName: integration.unique_key,
        displayName: integration.display_name || integration.unique_key,
        provider: integration.provider,
        logoUrl: `${basePublicUrl}/images/template-logos/${integration.provider}.svg`,
        createdAt: integration.created_at.toISOString(),
        updatedAt: integration.updated_at.toISOString()
    };
}
