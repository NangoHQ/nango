import type { NangoAction, Lead } from '../../models';
import type { UnanetLead } from '../types';
import { toLead } from '../mappers/to-lead.js';

export default async function runAction(nango: NangoAction, input: Lead): Promise<Lead> {
    if (!input?.name) {
        throw new nango.ActionError({
            message: 'Name is required to create a lead',
            code: 'missing_name'
        });
    }

    const data: UnanetLead = {
        Name: input.name
    };

    if (input.activities) {
        const note = input.activities.map((activity) => {
            return activity.message;
        });

        data.Notes = note.join(',');
    }

    const response = await nango.post({
        endpoint: '/api/leads',
        data: [data]
    });

    return toLead(response.data[0]);
}
