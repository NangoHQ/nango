import type { NangoAction, Lead } from '../../models';
import type { UnanetLead } from '../types';
import { toLead } from '../mappers/to-lead.js';
import { optionalsToPotentialClient } from '../mappers/federal-agency.js';

export default async function runAction(nango: NangoAction, input: Lead): Promise<Lead> {
    validate(nango, input);

    const data: UnanetLead = {
        Name: input.name,
        BidDate: input.dueDate,
        CreateDate: input.postedDate,
        SolicitationNumber: input.solicitationNumber,
        Naics: Array.isArray(input.naicsCategory) ? input.naicsCategory : [input.naicsCategory],
        City: input.city,
        State: input.state,
        Country: input.country,
        Description: input.description
    };

    const potentialClient = await optionalsToPotentialClient(nango, input.federalAgency);

    data.PotentialClient = potentialClient;

    const response = await nango.post({
        endpoint: '/api/leads',
        data: [data]
    });

    const mapped = toLead(response.data[0], input);

    mapped.federalAgency = input.federalAgency;

    return mapped;
}

function validate(nango: NangoAction, input: Lead) {
    type leads = keyof Lead;
    const required: leads[] = ['name', 'dueDate', 'postedDate', 'solicitationNumber', 'naicsCategory', 'city', 'state', 'country', 'description'];

    required.forEach((field) => {
        if (!input[field]) {
            throw new nango.ActionError({
                message: `${field} is required to create a lead`,
                code: `missing_${field}`
            });
        }
    });

    if (!input.federalAgency) {
        throw new nango.ActionError({
            message: 'federalAgency is required to create a lead',
            code: 'missing_federalAgency'
        });
    }

    if (!input.federalAgency.name) {
        throw new nango.ActionError({
            message: 'federalAgency.name is required to create a lead',
            code: 'missing_federalAgency_name'
        });
    }

    if (!input.federalAgency.companyId) {
        throw new nango.ActionError({
            message: 'federalAgency.companyId is required to create a lead',
            code: 'missing_federalAgency_companyId'
        });
    }
}
