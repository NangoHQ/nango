import type { NangoAction, Candidate, CreateCandidate } from '../../models';
import { constructRequest } from '../helpers/construct-request.js';

export default async function runAction(nango: NangoAction, input: CreateCandidate): Promise<Candidate> {
    if (!input?.email) {
        throw new nango.ActionError({
            message: `email is missing`
        });
    }

    const config = await constructRequest(nango, '/v1/candidates');

    const response = await nango.post<Candidate>({
        ...config,
        data: input
    });

    return response.data;
}
