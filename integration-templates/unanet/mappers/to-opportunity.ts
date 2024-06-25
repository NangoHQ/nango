import type { Opportunity } from '../../models';
import type { UnanetOpportunity } from '../types';

export function toOpportunity(opportunity: UnanetOpportunity): Opportunity {
    return {
        name: opportunity.OpportunityName,
        description: '',
        id: opportunity.OpportunityId.toString(),
        externalId: opportunity.ExternalId,
        companyName: opportunity.ClientName,
        stage: opportunity.Stage,
        active: opportunity.ActiveInd === 1
    };
}
