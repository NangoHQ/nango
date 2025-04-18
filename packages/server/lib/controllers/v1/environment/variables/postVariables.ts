import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import type { PostEnvironmentVariables } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { environmentService } from '@nangohq/shared';

const validation = z
    .object({
        variables: z.array(z.object({ name: z.string().min(1).max(256), value: z.string().min(1).max(4000) })).max(100)
    })
    .strict();

export const postEnvironmentVariables = asyncWrapper<PostEnvironmentVariables>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { environment } = res.locals;

    const body: PostEnvironmentVariables['Body'] = val.data;

    const updated = await environmentService.editEnvironmentVariable(environment.id, body.variables);
    if (!updated && body.variables.length > 0) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to update environment variables' } });
        return;
    }

    res.status(200).send({ success: true });
});
