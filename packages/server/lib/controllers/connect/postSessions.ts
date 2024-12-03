import type { PostConnectSessions } from '@nangohq/types';
import { z } from 'zod';
import db from '@nangohq/database';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import * as keystore from '@nangohq/keystore';
import * as endUserService from '@nangohq/shared';
import * as connectSessionService from '../../services/connectSession.service.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

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
                        connection_config: z.record(z.unknown())
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

    await db.knex.transaction(async (trx) => {
        // Check if the endUser exists in the database
        const getEndUser = await endUserService.getEndUser(trx, {
            endUserId: req.body.end_user.id,
            accountId: account.id,
            environmentId: environment.id
        });

        let endUserInternalId: number;
        if (getEndUser.isErr()) {
            if (getEndUser.error.code !== 'not_found') {
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to get end user' } });
                return;
            }
            // create end user if it doesn't exist yet
            const createEndUser = await endUserService.createEndUser(trx, {
                endUserId: req.body.end_user.id,
                email: req.body.end_user.email,
                displayName: req.body.end_user.display_name || null,
                organization: req.body.organization?.id
                    ? {
                          organizationId: req.body.organization.id,
                          displayName: req.body.organization.display_name || null
                      }
                    : null,
                accountId: account.id,
                environmentId: environment.id
            });
            if (createEndUser.isErr()) {
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to create end user' } });
                return;
            }
            endUserInternalId = createEndUser.value.id;
        } else {
            const shouldUpdate =
                getEndUser.value.email !== req.body.end_user.email ||
                getEndUser.value.displayName !== req.body.end_user.display_name ||
                getEndUser.value.organization?.organizationId !== req.body.organization?.id ||
                getEndUser.value.organization?.displayName !== req.body.organization?.display_name;
            if (shouldUpdate) {
                const updateEndUser = await endUserService.updateEndUser(trx, {
                    endUserId: getEndUser.value.endUserId,
                    accountId: account.id,
                    environmentId: environment.id,
                    email: req.body.end_user.email,
                    displayName: req.body.end_user.display_name || null,
                    organization: req.body.organization?.id
                        ? {
                              organizationId: req.body.organization.id,
                              displayName: req.body.organization.display_name || null
                          }
                        : null
                });
                if (updateEndUser.isErr()) {
                    res.status(500).send({ error: { code: 'server_error', message: 'Failed to update end user' } });
                    return;
                }
            }
            endUserInternalId = getEndUser.value.id;
        }

        // create connect session
        const createConnectSession = await connectSessionService.createConnectSession(trx, {
            endUserId: endUserInternalId,
            accountId: account.id,
            environmentId: environment.id,
            allowedIntegrations: req.body.allowed_integrations || null,
            integrationsConfigDefaults: req.body.integrations_config_defaults
                ? Object.fromEntries(
                      Object.entries(req.body.integrations_config_defaults).map(([key, value]) => [key, { connectionConfig: value.connection_config }])
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
        res.status(201).send({ data: { token, expires_at: privateKey.expiresAt! } });
        return;
    });
});
