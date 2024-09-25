import type { PostConnectSessions } from '@nangohq/types';
import { z } from 'zod';
import db from '@nangohq/database';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { validateRequest } from '@nangohq/utils';
import * as keystore from '@nangohq/keystore';
import * as linkedProfileService from '../../services/linkedProfile.service.js';
import * as connectSessionService from '../../services/connectSession.service.js';

const validate = validateRequest<PostConnectSessions>({
    parseBody: (data) =>
        z
            .object({
                linkedProfile: z.object({
                    profileId: z.string().max(255).min(1),
                    email: z.string().email().optional(),
                    displayName: z.string().max(255).optional(),
                    organization: z
                        .object({
                            organizationId: z.string().max(255).min(0),
                            displayName: z.string().max(255).optional()
                        })
                        .optional()
                }),
                allowedIntegrations: z.array(z.string()).optional(),
                integrationsConfigDefaults: z
                    .record(
                        z.object({
                            connectionConfig: z.record(z.unknown())
                        })
                    )
                    .optional()
            })
            .strict()
            .parse(data)
});

const handler = asyncWrapper<PostConnectSessions>(async (req, res) => {
    await db.knex.transaction(async (trx) => {
        // Check if the linkedProfile exists in the database
        const getLinkedProfile = await linkedProfileService.getLinkedProfile(trx, {
            profileId: req.body.linkedProfile.profileId,
            accountId: res.locals.account.id,
            environmentId: res.locals.environment.id
        });

        let linkedProfileId: number;
        if (getLinkedProfile.isErr()) {
            // create linked profile if it doesn't exist yet
            if (getLinkedProfile.error.code === 'not_found') {
                // fail if linkedProfile doesn't exist and email is not provided
                if (!req.body.linkedProfile.email) {
                    res.status(400).send({
                        error: {
                            code: 'invalid_request',
                            errors: [{ code: 'invalid_type', message: 'email is required', path: ['linkedProfile', 'email'] }]
                        }
                    });
                    return;
                }

                const createLinkedProfile = await linkedProfileService.createLinkedProfile(trx, {
                    profileId: req.body.linkedProfile.profileId,
                    email: req.body.linkedProfile.email,
                    displayName: req.body.linkedProfile.displayName || null,
                    organization: req.body.linkedProfile.organization?.organizationId
                        ? {
                              organizationId: req.body.linkedProfile.organization.organizationId,
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
                console.log(getLinkedProfile.error);
                res.status(500).send({ error: { code: 'internal_error', message: 'Failed to get linked profile' } });
                return;
            }
        } else {
            // TODO: what if linkedProfile exists but email, displayName, or organization is different?
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
        res.status(201).send({ token, expiresAt: privateKey.expiresAt! });
        return;
    });
});

export const postConnectSessions = [validate, handler];
