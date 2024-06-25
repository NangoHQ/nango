import type { NangoAction, Lead } from '../../models';
import type { UnanetLead } from '../types';
import { toLead } from '../mappers/to-lead.js';

export default async function runAction(nango: NangoAction, input: Lead): Promise<Lead> {
    if (!input.id) {
        throw new nango.ActionError({
            message: 'ID is required to update a lead',
            code: 'missing_id'
        });
    }

    const data: UnanetLead = {
        Name: input.name
    };

    if (input.description) {
        data.Description = input.description;
    }

    if (input.activities) {
        const note = input.activities.map((activity) => {
            return activity.message;
        });

        data.Notes = note.join(',');
    }

    const response = await nango.put({
        endpoint: `/api/leads/${input.id}`,
        data
    });

    return toLead(response.data);
}
