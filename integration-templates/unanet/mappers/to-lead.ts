import type { Lead } from '../../models';
import type { UnanetLead } from '../types';

export function toLead(unanetLead: UnanetLead): Lead {
    if (!unanetLead.LeadId) {
        throw new Error('LeadId is required');
    }

    const lead: Lead = {
        id: unanetLead.LeadId?.toString(),
        name: unanetLead.Name,
        description: unanetLead.Description || '',
        createdAt: unanetLead.CreateDate ? new Date(unanetLead.CreateDate).toISOString() : '',
        updatedAt: unanetLead.ModifyDate ? new Date(unanetLead.ModifyDate).toISOString() : ''
    };

    if (unanetLead.StageId) {
        lead.stage = {
            id: unanetLead.StageId,
            name: unanetLead.StageName || '',
            status: unanetLead.StageTypeName || ''
        };
    }

    return lead;
}
