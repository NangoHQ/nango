import { z } from 'zod';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PostRollout, CommitHash } from '@nangohq/types';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { runnersFleet } from '../../fleet.js';

const bodyValidation = z
    .object({
        commitHash: z
            .string()
            .length(40)
            .transform((data) => {
                return data as CommitHash;
            })
    })
    .strict();

const paramsValidation = z
    .object({
        fleetId: z.string().min(1)
    })
    .strict();

export const postRollout = asyncWrapper<PostRollout>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const body = bodyValidation.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    const params = paramsValidation.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    const { fleetId }: PostRollout['Params'] = params.data;
    const { commitHash }: PostRollout['Body'] = body.data;

    if (fleetId !== runnersFleet.fleetId) {
        res.status(404).send({ error: { code: 'invalid_uri_params', message: 'Unknown fleet' } });
        return;
    }

    const rollout = await runnersFleet.rollout(commitHash);
    if (rollout.isErr()) {
        res.status(500).send({ error: { code: 'rollout_failed', message: rollout.error.message } });
    } else {
        res.status(200).send(rollout.value);
    }
    return;
});
