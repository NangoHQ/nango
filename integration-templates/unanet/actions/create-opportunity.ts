import type { NangoAction, Opportunity } from '../../models';
import type { CreateUnanetOpportunity } from '../types';

import { getOrCreateCompany } from '../helpers/get-or-create-company.js';
import { findStage } from '../helpers/find-stage.js';
import { toOpportunity } from '../mappers/to-opportunity.js';

export default async function runAction(nango: NangoAction, input: Opportunity): Promise<Opportunity> {
    if (!input.companyName) {
        throw new nango.ActionError({
            message: 'Company Name is required to create an opportunity',
            code: 'missing_company_name'
        });
    }

    if (!input.name) {
        throw new nango.ActionError({
            message: 'Name is required to create an opportunity',
            code: 'missing_name'
        });
    }

    if (!input.stage) {
        throw new nango.ActionError({
            message: 'Stage is required to create an opportunity',
            code: 'missing_stage'
        });
    }

    const company = await getOrCreateCompany(nango, input.companyName);

    const stage = await findStage(nango, input.stage);

    if (!stage) {
        throw new nango.ActionError({
            message: 'Stage not found. Please use a valid stage',
            code: 'stage_not_found'
        });
    }

    const opportunity: CreateUnanetOpportunity = {
        ClientId: Number(company.id),
        ClientName: company.name,
        OpportunityName: input.name,
        Stage: input.stage,
        StageId: stage.id,
        ActiveInd: Number(input.active || true)
    };

    const response = await nango.post({
        endpoint: '/api/opportunities',
        data: [opportunity]
    });

    return toOpportunity(response.data[0]);
}
