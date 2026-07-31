import * as z from 'zod/v4';

import { Err, Ok } from '@nangohq/utils';

import integrationService from '../../../services/integration.service.js';
import { defineControlPlaneMcpTool } from '../controlPlaneTool.js';
import { PublicMcpError } from '../utils.js';

import type { GetPublicListIntegrations } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const listIntegrationsArgumentsSchema = z.object({}).strict();

const listIntegrationsOutputSchema = z
    .object({
        data: z.array(
            z
                .object({
                    unique_key: z.string(),
                    provider: z.string(),
                    display_name: z.string(),
                    logo: z.string(),
                    credentials_label: z.record(z.string(), z.string()).optional(),
                    preconfigured_credentials: z.array(z.string()).optional(),
                    forward_webhooks: z.boolean(),
                    created_at: z.string(),
                    updated_at: z.string()
                })
                .strict()
        )
    })
    .strict();

type ParsedListIntegrationsArguments = z.infer<typeof listIntegrationsArgumentsSchema>;

export const integrationsListTool = defineControlPlaneMcpTool<GetPublicListIntegrations['Success']>({
    name: 'integrations_list',
    description: 'List integrations configured in the authenticated Nango environment.',
    inputSchema: listIntegrationsArgumentsSchema,
    outputSchema: listIntegrationsOutputSchema,
    requiredScopes: ['environment:integrations:list'],
    async handler(args, { environment }) {
        const parsedArgs = parseListIntegrationsArguments(args);
        if (parsedArgs.isErr()) {
            return Err(parsedArgs.error);
        }

        return await integrationService.list({ environmentId: environment.id });
    }
});

function parseListIntegrationsArguments(args: unknown): Result<ParsedListIntegrationsArguments> {
    const parsedArgs = listIntegrationsArgumentsSchema.safeParse(args ?? {});
    if (!parsedArgs.success) {
        return Err(new PublicMcpError(formatListIntegrationsArgumentsError(parsedArgs.error)));
    }

    return Ok(parsedArgs.data);
}

function formatListIntegrationsArgumentsError(error: z.ZodError): string {
    const details = error.issues
        .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'arguments';
            return `${path}: ${issue.message}`;
        })
        .join('; ');

    return details ? `Invalid integrations_list arguments: ${details}` : 'Invalid integrations_list arguments';
}
