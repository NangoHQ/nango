import type { NangoAction, Candidate, CreateCandidate, Location } from '../../models';
import { constructRequest } from '../helpers/construct-request.js';

export default async function runAction(nango: NangoAction, rawInput: CreateCandidate): Promise<Candidate> {
    validate(nango, rawInput);

    const work_location: Location = {
        country: rawInput.country
    };

    const { country, ...rest } = rawInput;

    const input = { ...rest };

    if (input?.state) {
        work_location.state = input.state;

        delete input.state;
    }

    if (input?.city) {
        work_location.city = input.city;

        delete input.city;
    }

    const config = await constructRequest(nango, '/v1/candidates');

    const response = await nango.post<Candidate>({
        ...config,
        data: {
            ...input,
            work_locations: [work_location]
        }
    });

    return response.data;
}

function validate(nango: NangoAction, input: CreateCandidate): void {
    if (!input) {
        throw new nango.ActionError({
            message: `input is missing`
        });
    }

    if (!input.email) {
        throw new nango.ActionError({
            message: `email is missing`
        });
    }

    if (!input.first_name) {
        throw new nango.ActionError({
            message: `first_name is missing`
        });
    }

    if (!input.middle_name && typeof input?.no_middle_name === 'undefined') {
        throw new nango.ActionError({
            message: `middle_name is missing or no_middle_name (boolean) is missing`
        });
    }

    if (!input.phone) {
        throw new nango.ActionError({
            message: `phone is missing`
        });
    }

    if (!input.country) {
        throw new nango.ActionError({
            message: `country is missing`
        });
    }
}
