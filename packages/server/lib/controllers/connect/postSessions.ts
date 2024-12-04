import type { PostConnectSessions } from '@nangohq/types';
import type { ZodIssue } from 'zod';
import { z } from 'zod';
import db from '@nangohq/database';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import * as keystore from '@nangohq/keystore';
import * as connectSessionService from '../../services/connectSession.service.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { configService, createEndUser, getEndUser, updateEndUser } from '@nangohq/shared';

export const bodySchema = z
    .object({
        end_user: z
            .object({
                id: z.string().max(255).min(1),
                email: z.string().email().min(5),
                display_name: z.string().max(255).optional()
            })
            .strict(),
        organization: z
            .object({
                id: z.string().max(255).min(0),
                display_name: z.string().max(255).optional()
            })
            .strict()
            .optional(),
        allowed_integrations: z.array(z.string()).optional(),
        integrations_config_defaults: z
            .record(
                z
                    .object({
                        user_scopes: z.string().optional(),
                        connection_config: z
                            .object({
                                oauth_scopes_override: z.string().optional()
                            })
                            .passthrough()
                    })
                    .strict()
            )
            .optional()
    })
    .strict();

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

    const { account, environment } = res.locals;
    const body: PostConnectSessions['Body'] = val.data;

    await db.knex.transaction(async (trx) => {
        // Check if the endUser exists in the database
        const endUserRes = await getEndUser(trx, {
            endUserId: body.end_user.id,
            accountId: account.id,
            environmentId: environment.id
        });

        let endUserInternalId: number;
        if (endUserRes.isErr()) {
            if (endUserRes.error.code !== 'not_found') {
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to get end user' } });
                return;
            }

            // create end user if it doesn't exist yet
            const createdEndUser = await createEndUser(trx, {
                endUserId: body.end_user.id,
                email: body.end_user.email,
                displayName: body.end_user.display_name || null,
                organization: body.organization?.id
                    ? {
                          organizationId: body.organization.id,
                          displayName: body.organization.display_name || null
                      }
                    : null,
                accountId: account.id,
                environmentId: environment.id
            });
            if (createdEndUser.isErr()) {
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to create end user' } });
                return;
            }
            endUserInternalId = createdEndUser.value.id;
        } else {
            const endUser = endUserRes.value;
            const shouldUpdate =
                endUser.email !== body.end_user.email ||
                endUser.displayName !== body.end_user.display_name ||
                endUser.organization?.organizationId !== body.organization?.id ||
                endUser.organization?.displayName !== body.organization?.display_name;
            if (shouldUpdate) {
                const updatedEndUser = await updateEndUser(trx, {
                    endUserId: endUser.endUserId,
                    accountId: account.id,
                    environmentId: environment.id,
                    email: body.end_user.email,
                    displayName: body.end_user.display_name || null,
                    organization: body.organization?.id
                        ? {
                              organizationId: body.organization.id,
                              displayName: body.organization.display_name || null
                          }
                        : null
                });
                if (updatedEndUser.isErr()) {
                    res.status(500).send({ error: { code: 'server_error', message: 'Failed to update end user' } });
                    return;
                }
            }
            endUserInternalId = endUser.id;
        }

        const integrations = await configService.listProviderConfigs(environment.id);
        // Enforce that integrations exists in `allowed_integrations`
        if (body.allowed_integrations && body.allowed_integrations.length > 0) {
            const errors: ZodIssue[] = [];
            for (const [key, uniqueKey] of body.allowed_integrations.entries()) {
                if (!integrations.find((v) => v.unique_key === uniqueKey)) {
                    errors.push({ path: ['allowed_integrations', key], code: 'custom', message: 'Integration does not exist' });
                }
            }
            if (errors.length > 0) {
                res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP({ issues: errors }) } });
                return;
            }
        }

        // Enforce that integrations exists `integrations_config_defaults`
        if (body.integrations_config_defaults) {
            const errors: ZodIssue[] = [];
            for (const uniqueKey of Object.keys(body.integrations_config_defaults)) {
                if (!integrations.find((v) => v.unique_key === uniqueKey)) {
                    errors.push({ path: ['integrations_config_defaults', uniqueKey], code: 'custom', message: 'Integration does not exist' });
                }
            }
            if (errors.length > 0) {
                res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP({ issues: errors }) } });
                return;
            }
        }

        // create connect session
        const createConnectSession = await connectSessionService.createConnectSession(trx, {
            endUserId: endUserInternalId,
            accountId: account.id,
            environmentId: environment.id,
            allowedIntegrations: body.allowed_integrations && body.allowed_integrations.length > 0 ? body.allowed_integrations : null,
            integrationsConfigDefaults: body.integrations_config_defaults
                ? Object.fromEntries(
                      Object.entries(body.integrations_config_defaults).map(([key, value]) => [
                          key,
                          { user_scopes: value.user_scopes, connectionConfig: value.connection_config }
                      ])
                  )
                : null
        });
        if (createConnectSession.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create connect session' } });
            return;
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
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create session token' } });
            return;
        }

        const [token, privateKey] = createPrivateKey.value;
        res.status(201).send({ data: { token, expires_at: privateKey.expiresAt!.toISOString() } });
    });
});
