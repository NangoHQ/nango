import type { NangoAction, Company } from '../../models';

import { getOrCreateCompany } from '../helpers/get-or-create-company.js';

export default async function runAction(nango: NangoAction, input: Company): Promise<Company> {
    if (!input?.name) {
        throw new nango.ActionError({
            message: 'Name is required to create a company',
            code: 'missing_name'
        });
    }

    const federalAgency = input.federalAgency ?? { name: input.name };

    const company = await getOrCreateCompany(nango, federalAgency);

    return company;
}
