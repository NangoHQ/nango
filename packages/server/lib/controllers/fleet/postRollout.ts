import * as z from 'zod';

import { Fleet } from '@nangohq/fleet';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { ImageType, PostRollout } from '@nangohq/types';

const bodyValidation = z
    .object({
        imageType: z.enum(['docker', 'ecr']).optional(),
        image: z.string()
    })
    .strict()
    .refine(
        (data) => {
            return /^[a-z0-9-]+\/[a-z0-9-]+:[a-f0-9]{40}$/.test(data.image) || /^[a-z0-9-]+\/[a-z0-9-]+@sha256:[a-f0-9]{64}$/.test(data.image);
        },
        {
            message: "Invalid image format. Must be 'repository/image:commit' or 'respository/image@sha256:xxx'",
            path: ['image']
        }
    );

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
    const runnersFleet = new Fleet({ fleetId });

    const { image, imageType = 'docker' } = body.data;

    const rollout = await runnersFleet.rollout(image, {
        imageType: imageType as ImageType,
        verifyImage: true
    });
    if (rollout.isErr()) {
        res.status(500).send({ error: { code: 'rollout_failed', message: rollout.error.message } });
    } else {
        res.status(200).send(rollout.value);
    }
    return;
});
