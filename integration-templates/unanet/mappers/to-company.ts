import type { UnanetCompany } from '../types';
import type { Company } from '../../models';

export function toCompany(company: UnanetCompany): Company {
    return {
        id: company.CompanyId.toString(),
        name: company.Name,
        externalId: company.ExternalId,
        shortName: company.Acronym,
        description: company.Notes
    };
}
