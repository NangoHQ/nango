import type { PostConnectSessions } from '@nangohq/types';
import type { ZodIssue } from 'zod';
import { z } from 'zod';
import db from '@nangohq/database';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import * as keystore from '@nangohq/keystore';
import * as connectSessionService from '../../services/connectSession.service.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { Config } from '@nangohq/shared';
import { configService, upsertEndUser } from '@nangohq/shared';
import { providerConfigKeySchema } from '../../helpers/validation.js';

export const bodySchema = z
    .object({
        end_user: z
            .object({
                id: z.string().max(255).min(1),
                email: z.string().email().min(5).optional(),
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
        allowed_integrations: z.array(providerConfigKeySchema).optional(),
        integrations_config_defaults: z
            .record(
                providerConfigKeySchema,
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

    const { account, environment } = res.locals;
    const body: PostConnectSessions['Body'] = val.data;

    const { status, response }: Reply = await db.knex.transaction(async (trx) => {
        const endUserRes = await upsertEndUser(trx, { account, environment, endUserPayload: body.end_user, organization: body.organization });
        if (endUserRes.isErr()) {
            return { status: 500, response: { error: { code: 'server_error', message: 'Failed to get end user' } } };
        }

        if (body.allowed_integrations || body.integrations_config_defaults) {
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
                    return { status: 400, response: { error: { code: 'invalid_body', errors: zodErrorToHTTP({ issues: errors }) } } };
                }
            }

            // Enforce that integrations exists in `integrations_config_defaults`
            const check = checkIntegrationsDefault(body, integrations);
            if (check) {
                return { status: 400, response: { error: { code: 'invalid_body', errors: zodErrorToHTTP({ issues: check }) } } };
            }
        }

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
                          { user_scopes: value.user_scopes, connectionConfig: value.connection_config }
                      ])
                  )
                : null
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
});

/**
 * Enforce that integrations exists in `integrations_config_defaults`
 */
export function checkIntegrationsDefault(body: Pick<PostConnectSessions['Body'], 'integrations_config_defaults'>, integrations: Config[]): ZodIssue[] | false {
    if (!body.integrations_config_defaults) {
        return false;
    }

    const errors: ZodIssue[] = [];
    for (const uniqueKey of Object.keys(body.integrations_config_defaults)) {
        if (!integrations.find((v) => v.unique_key === uniqueKey)) {
            errors.push({ path: ['integrations_config_defaults', uniqueKey], code: 'custom', message: 'Integration does not exist' });
        }
    }

    return errors.length > 0 ? errors : false;
}
