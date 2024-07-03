import type { CreateLead, Lead, UpdateLead } from '../../models';
import type { UnanetLead } from '../types';

export function toLead(unanetLead: UnanetLead, input: Lead | CreateLead | UpdateLead): Lead {
    if (!unanetLead.LeadId) {
        throw new Error('LeadId is required');
    }

    const lead: Lead = {
        id: unanetLead.LeadId.toString(),
        name: unanetLead.Name,
        description: unanetLead.Description || '',
        dueDate: unanetLead.BidDate ? new Date(unanetLead.BidDate).toISOString() : '',
        postedDate: unanetLead.CreateDate ? new Date(unanetLead.CreateDate).toISOString() : '',
        solicitationNumber: unanetLead.SolicitationNumber || '',
        naicsCategory: unanetLead.Naics || input.naicsCategory || [],
        federalAgency: input.federalAgency,
        city: unanetLead.City || '',
        state: unanetLead.State || '',
        country: unanetLead.Country || '',
        createdAt: unanetLead.CreateDate ? new Date(unanetLead.CreateDate).toISOString() : '',
        updatedAt: unanetLead.ModifyDate ? new Date(unanetLead.ModifyDate).toISOString() : ''
    };

    return lead;
}
