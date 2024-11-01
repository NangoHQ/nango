import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { DBTeam, UpdateOtlpSettings } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP, isEnterprise } from '@nangohq/utils';
import { environmentService, featureFlags } from '@nangohq/shared';

const bodyValidation = z
    .object({
        endpoint: z.string().url(),
        headers: z.record(z.string())
    })
    .strict();

export const postSettings = asyncWrapper<UpdateOtlpSettings>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = bodyValidation.safeParse(req.body);

    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const { environment, account } = res.locals;

    const isEnabled = await isOtlpEnabled({ account });
    if (!isEnabled) {
        res.status(403).send({ error: { code: 'forbidden', message: 'OpenTelemetry export is not enabled for this account' } });
        return;
    }

    const { data: settings } = val;

    settings.endpoint = settings.endpoint.trim().replace(/\/$/, '');

    const newSettings = settings.endpoint.length > 0 ? settings : null;
    await environmentService.editOtlpSettings(environment.id, newSettings);

    res.send(settings);
});

const isOtlpEnabled = async ({ account }: { account: DBTeam }): Promise<boolean> => {
    if (isEnterprise) {
        return true;
    }
    return featureFlags.isEnabled('feature:otlp:account', account.uuid, false);
};
