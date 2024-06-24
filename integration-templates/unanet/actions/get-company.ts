import type { NangoAction, Entity, Company } from '../../models';

import { getCompany } from '../helpers/get-or-create-company.js';

export default async function runAction(nango: NangoAction, input: Entity): Promise<Company | null> {
    if (!input?.name) {
        throw new nango.ActionError({
            message: 'Name is required to create a company',
            code: 'missing_name'
        });
    }

    const company = await getCompany(nango, input.name);

    return company;
}
