import type { PostConnectSessions } from '@nangohq/types';
import { z } from 'zod';
import db from '@nangohq/database';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import * as keystore from '@nangohq/keystore';
import * as linkedProfileService from '../../services/linkedProfile.service.js';
import * as connectSessionService from '../../services/connectSession.service.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

const bodySchema = z
    .object({
        linkedProfile: z
            .object({
                profileId: z.string().max(255).min(1),
                email: z.string().email().min(5),
                displayName: z.string().max(255).optional(),
                organization: z
                    .object({
                        id: z.string().max(255).min(0),
                        displayName: z.string().max(255).optional()
                    })
                    .strict()
                    .optional()
            })
            .strict(),
        allowedIntegrations: z.array(z.string()).optional(),
        integrationsConfigDefaults: z
            .record(
                z
                    .object({
                        connectionConfig: z.record(z.unknown())
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

    await db.knex.transaction(async (trx) => {
        // Check if the linkedProfile exists in the database
        const getLinkedProfile = await linkedProfileService.getLinkedProfile(trx, {
            profileId: req.body.linkedProfile.profileId,
            accountId: res.locals.account.id,
            environmentId: res.locals.environment.id
        });

        let linkedProfileId: number;
        if (getLinkedProfile.isErr()) {
            if (getLinkedProfile.error.code !== 'not_found') {
                res.status(500).send({ error: { code: 'internal_error', message: 'Failed to get linked profile' } });
                return;
            }
            // create linked profile if it doesn't exist yet
            const createLinkedProfile = await linkedProfileService.createLinkedProfile(trx, {
                profileId: req.body.linkedProfile.profileId,
                email: req.body.linkedProfile.email,
                displayName: req.body.linkedProfile.displayName || null,
                organization: req.body.linkedProfile.organization?.id
                    ? {
                          id: req.body.linkedProfile.organization.id,
                          displayName: req.body.linkedProfile.organization.displayName || null
                      }
                    : null,
                accountId: res.locals.account.id,
                environmentId: res.locals.environment.id
            });
            if (createLinkedProfile.isErr()) {
                res.status(500).send({ error: { code: 'internal_error', message: 'Failed to create linked profile' } });
                return;
            }
            linkedProfileId = createLinkedProfile.value.id;
        } else {
            const shouldUpdate =
                getLinkedProfile.value.email !== req.body.linkedProfile.email ||
                getLinkedProfile.value.displayName !== req.body.linkedProfile.displayName ||
                getLinkedProfile.value.organization?.id !== req.body.linkedProfile.organization?.id ||
                getLinkedProfile.value.organization?.displayName !== req.body.linkedProfile.organization?.displayName;
            if (shouldUpdate) {
                const updateLinkedProfile = await linkedProfileService.updateLinkedProfile(trx, {
                    profileId: getLinkedProfile.value.profileId,
                    accountId: res.locals.account.id,
                    environmentId: res.locals.environment.id,
                    email: req.body.linkedProfile.email,
                    displayName: req.body.linkedProfile.displayName || null,
                    organization: req.body.linkedProfile.organization?.id
                        ? {
                              id: req.body.linkedProfile.organization.id,
                              displayName: req.body.linkedProfile.organization.displayName || null
                          }
                        : null
                });
                if (updateLinkedProfile.isErr()) {
                    res.status(500).send({ error: { code: 'internal_error', message: 'Failed to update linked profile' } });
                    return;
                }
            }
            linkedProfileId = getLinkedProfile.value.id;
        }

        // create connect session
        const createConnectSession = await connectSessionService.createConnectSession(trx, {
            linkedProfileId: linkedProfileId,
            accountId: res.locals.account.id,
            environmentId: res.locals.environment.id,
            allowedIntegrations: req.body.allowedIntegrations || null,
            integrationsConfigDefaults: req.body.integrationsConfigDefaults || null
        });
        if (createConnectSession.isErr()) {
            res.status(500).send({ error: { code: 'internal_error', message: 'Failed to create connect session' } });
            return;
        }
        // create a private key for the connect session
        const createPrivateKey = await keystore.createPrivateKey(trx, {
            displayName: '',
            accountId: res.locals.account.id,
            environmentId: res.locals.environment.id,
            entityType: 'connect_session',
            entityId: createConnectSession.value.id,
            ttlInMs: 30 * 60 * 1000 // 30 minutes
        });
        if (createPrivateKey.isErr()) {
            res.status(500).send({ error: { code: 'internal_error', message: 'Failed to create session token' } });
            return;
        }
        const [token, privateKey] = createPrivateKey.value;
        res.status(201).send({ data: { token, expiresAt: privateKey.expiresAt! } });
        return;
    });
});
