import type { Opportunity } from '../../models';
import type { UnanetOpportunity } from '../types';

export function toOpportunity(opportunity: UnanetOpportunity, input: Opportunity): Opportunity {
    return {
        name: opportunity.OpportunityName,
        description: '',
        id: opportunity.OpportunityId.toString(),
        externalId: opportunity.ExternalId,
        dueDate: opportunity.CloseDate ? new Date(opportunity.CloseDate).toISOString() : '',
        federalAgency: input.federalAgency,
        city: opportunity.City || '',
        state: opportunity.State,
        country: opportunity.Country,
        stage: opportunity.Stage,
        active: opportunity.ActiveInd === 1
    };
}
