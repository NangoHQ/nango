import type { NangoAction, UpdateLead, Lead } from '../../models';
import type { UnanetLead } from '../types';
import { toLead } from '../mappers/to-lead.js';
import { optionalsToPotentialClient } from '../mappers/federal-agency.js';

export default async function runAction(nango: NangoAction, input: UpdateLead): Promise<Lead> {
    if (!input.id) {
        throw new nango.ActionError({
            message: 'ID is required to update a lead',
            code: 'missing_id'
        });
    }

    const data: Partial<UnanetLead> = {
        Name: input.name
    };

    if (input.description) {
        data.Description = input.description;
    }

    if (input.dueDate) {
        data.BidDate = input.dueDate;
    }

    if (input.postedDate) {
        data.CreateDate = input.postedDate;
    }

    if (input.solicitationNumber) {
        data.SolicitationNumber = input.solicitationNumber;
    }

    if (input.naicsCategory) {
        data.Naics = Array.isArray(input.naicsCategory) ? input.naicsCategory : [input.naicsCategory];
    }

    if (input.city) {
        data.City = input.city;
    }

    if (input.state) {
        data.State = input.state;
    }

    if (input.country) {
        data.Country = input.country;
    }

    const potentialClient = await optionalsToPotentialClient(nango, input.federalAgency);

    data.PotentialClient = potentialClient;

    const response = await nango.put({
        endpoint: `/api/leads/${input.id}`,
        data
    });

    return toLead(response.data, input);
}
