import db from '@nangohq/database';
import { environmentService, getPlan, PROD_ENVIRONMENT_NAME } from '@nangohq/shared';
import { flagHasPlan } from '@nangohq/utils';

import type { RequestLocals } from '../../../utils/express.js';
import type { CreateEnvironmentError } from '@nangohq/shared';
import type { DBEnvironment, DBPlan, PostEnvironment, PostPublicEnvironment } from '@nangohq/types';
import type { Response } from 'express';

type PostEnvironmentResponse = Response<PostEnvironment['Reply'] | PostPublicEnvironment['Reply'], RequestLocals>;

function sendCreateEnvironmentError(res: PostEnvironmentResponse, error: CreateEnvironmentError): void {
    switch (error.code) {
        case 'invalid_is_prod_flag':
            res.status(400).send({
                error: { code: error.code, message: `The "${PROD_ENVIRONMENT_NAME}" environment must be marked as production.` }
            });
            return;
        case 'conflict':
            res.status(409).send({ error: { code: error.code, message: 'Environment already exists' } });
            return;
        case 'resource_capped':
            res.status(400).send({ error: { code: error.code, message: 'Maximum number of environments reached' } });
            return;
        case 'creation_failed':
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create environment' } });
            return;
        default:
            ((exhaustiveCheck: never) => {
                throw new Error(`Unhandled create environment error code: ${exhaustiveCheck}`);
            })(error.code);
    }
}

export async function handlePostEnvironment({
    res,
    accountId,
    name,
    isProduction,
    callbackUrl,
    hmacKey,
    hmacEnabled,
    slackNotifications,
    otlpSettings
}: {
    res: PostEnvironmentResponse;
    accountId: number;
    name: string;
    isProduction?: boolean | undefined;
    callbackUrl?: string | undefined;
    hmacKey?: string | undefined;
    hmacEnabled?: boolean | undefined;
    slackNotifications?: boolean | undefined;
    otlpSettings?: DBEnvironment['otlp_settings'] | undefined;
}): Promise<void> {
    let plan: DBPlan | undefined;
    if (flagHasPlan) {
        const planRes = await getPlan(db.knex, { accountId });
        if (planRes.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Unable to get plan' } });
            return;
        }
        plan = planRes.value;
    }

    if (otlpSettings && flagHasPlan && !plan?.has_otel) {
        res.status(403).send({
            error: {
                code: 'forbidden',
                message: 'OpenTelemetry export is not available for your account. Check if your Nango plan includes access to this feature.'
            }
        });
        return;
    }

    const created = await environmentService.createEnvironment(db.knex, {
        accountId,
        name,
        ...(isProduction !== undefined && { isProduction }),
        ...(callbackUrl !== undefined && { callbackUrl }),
        ...(hmacKey !== undefined && { hmacKey }),
        ...(hmacEnabled !== undefined && { hmacEnabled }),
        ...(slackNotifications !== undefined && { slackNotifications }),
        ...(otlpSettings !== undefined && { otlpSettings }),
        ...(plan && { plan })
    });
    if (created.isErr()) {
        sendCreateEnvironmentError(res, created.error);
        return;
    }

    res.status(200).send({ data: { id: created.value.id, uuid: created.value.uuid, name: created.value.name } });
}
