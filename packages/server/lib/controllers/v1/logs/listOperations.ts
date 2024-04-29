import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '../../../utils/validation.js';

const validation = z
    .object({
        limit: z.number().optional().default(100)
    })
    .strict();

export const listOperations = asyncWrapper<{ data: string[] } | { error: any }, { limit: number }>((req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    res.status(200).send({ data: [] });
});
