import * as z from 'zod';

import db from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import { defaultOperationExpiration, endUserToMeta, logContextGetter } from '@nangohq/logs';
import { configService, upsertEndUser } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { endUserSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import * as connectSessionService from '../../services/connectSession.service.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { RequestLocals } from '../../utils/express.js';
import type { Config } from '@nangohq/shared';
import type { DBPlan, PostConnectSessions } from '@nangohq/types';
import type { Response } from 'express';

export const bodySchema = z
    .object({
        end_user: endUserSchema,
        organization: z
            .object({
                id: z.string().max(255).min(0),
                display_name: z.string().max(255).optional()
            })
            .strict()
            .optional(),
        allowed_integrations: z.array(providerConfigKeySchema).optional(),
        integrations_config_defaults: z
            .record(
                providerConfigKeySchema,
                z
                    .object({
                        user_scopes: z.string().optional(),
                        authorization_params: z.record(z.string(), z.string()).optional(),
                        connection_config: z
                            .looseObject({
                                oauth_scopes_override: z.string().optional()
                            })
                            .optional()
                    })
                    .strict()
            )
            .optional(),
        overrides: z
            .record(
                providerConfigKeySchema,
                z.object({
                    docs_connect: z.string().optional()
                })
            )
            .optional()
    })
    .strict();

interface Reply {
    status: number;
    response: PostConnectSessions['Reply'];
}

export const postConnectSessions = asyncWrapper<PostConnectSessions>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = bodySchema.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { plan } = res.locals;

    const body: PostConnectSessions['Body'] = val.data;
    await generateSession(res, body, plan);
});

/**
 * Validate that all the integration keys exist
 */
export function checkIntegrationsExist(
    integrationRecords: Record<string, unknown> | undefined,
    integrations: Config[],
    path: string[]
): z.core.$ZodIssue[] | false {
    if (!integrationRecords) {
        return false;
    }

    const errors: z.core.$ZodIssue[] = [];
    for (const uniqueKey of Object.keys(integrationRecords)) {
        if (!integrations.find((v) => v.unique_key === uniqueKey)) {
            errors.push({
                path: [...path, uniqueKey],
                code: 'custom',
                message: 'Integration does not exist',
                input: integrationRecords
            });
        }
    }

    return errors.length > 0 ? errors : false;
}

export async function generateSession(res: Response<any, Required<RequestLocals>>, body: PostConnectSessions['Body'], plan?: DBPlan | null) {
    const { account, environment } = res.locals;
    const { status, response }: Reply = await db.knex.transaction(async (trx) => {
        const endUserRes = await upsertEndUser(trx, { account, environment, endUserPayload: body.end_user, organization: body.organization });
        if (endUserRes.isErr()) {
            return { status: 500, response: { error: { code: 'server_error', message: 'Failed to get end user' } } };
        }

        if (body.allowed_integrations || body.integrations_config_defaults || body.overrides) {
            const integrations = await configService.listProviderConfigs(trx, environment.id);

            // Enforce that integrations in `allowed_integrations` exist
            if (body.allowed_integrations && body.allowed_integrations.length > 0) {
                const errors: z.core.$ZodIssue[] = [];
                for (const [key, uniqueKey] of body.allowed_integrations.entries()) {
                    if (!integrations.find((v) => v.unique_key === uniqueKey)) {
                        errors.push({
                            path: ['allowed_integrations', key],
                            code: 'custom',
                            message: 'Integration does not exist',
                            input: body.allowed_integrations
                        });
                    }
                }
                if (errors.length > 0) {
                    return { status: 400, response: { error: { code: 'invalid_body', errors: zodErrorToHTTP({ issues: errors }) } } };
                }
            }

            // Enforce that integrations in `integrations_config_defaults` and `overrides` exist
            const integrationConfigsDefaultsErrors = checkIntegrationsExist(body.integrations_config_defaults, integrations, ['integrations_config_defaults']);
            const overridesErrors = checkIntegrationsExist(body.overrides, integrations, ['overrides']);
            if (integrationConfigsDefaultsErrors || overridesErrors) {
                return {
                    status: 400,
                    response: {
                        error: {
                            code: 'invalid_body',
                            errors: zodErrorToHTTP({ issues: [...(integrationConfigsDefaultsErrors || []), ...(overridesErrors || [])] })
                        }
                    }
                };
            }

            const canOverrideDocsConnectUrl = plan?.can_override_docs_connect_url ?? false;
            const isOverridingDocsConnectUrl = Object.values(body.overrides || {}).some((value) => value.docs_connect);
            if (isOverridingDocsConnectUrl && !canOverrideDocsConnectUrl) {
                return {
                    status: 403,
                    response: { error: { code: 'forbidden', message: 'You are not allowed to override the docs connect url' } }
                };
            }
        }

        const logCtx = await logContextGetter.create(
            {
                operation: { type: 'auth', action: 'create_connection' },
                meta: { connectSession: endUserToMeta(endUserRes.value) },
                expiresAt: defaultOperationExpiration.auth()
            },
            { account, environment }
        );

        // create connect session
        const createConnectSession = await connectSessionService.createConnectSession(trx, {
            endUserId: endUserRes.value.id,
            accountId: account.id,
            environmentId: environment.id,
            allowedIntegrations: body.allowed_integrations && body.allowed_integrations.length > 0 ? body.allowed_integrations : null,
            integrationsConfigDefaults: body.integrations_config_defaults
                ? Object.fromEntries(
                      Object.entries(body.integrations_config_defaults).map(([key, value]) => [
                          key,
                          { user_scopes: value.user_scopes, authorization_params: value.authorization_params, connectionConfig: value.connection_config }
                      ])
                  )
                : null,
            operationId: logCtx.id,
            overrides: body.overrides || null
        });
        if (createConnectSession.isErr()) {
            return { status: 500, response: { error: { code: 'server_error', message: 'Failed to create connect session' } } };
        }

        // create a private key for the connect session
        const createPrivateKey = await keystore.createPrivateKey(trx, {
            displayName: '',
            accountId: account.id,
            environmentId: environment.id,
            entityType: 'connect_session',
            entityId: createConnectSession.value.id,
            ttlInMs: 30 * 60 * 1000 // 30 minutes
        });
        if (createPrivateKey.isErr()) {
            return { status: 500, response: { error: { code: 'server_error', message: 'Failed to create session token' } } };
        }

        const [token, privateKey] = createPrivateKey.value;
        return { status: 201, response: { data: { token, expires_at: privateKey.expiresAt!.toISOString() } } };
    });

    res.status(status).send(response);
}
