import type { Company, NangoAction } from '../../models';
import { toCompany } from '../mappers/to-company.js';

export async function getCompany(nango: NangoAction, name: string): Promise<Company | null> {
    const response = await nango.get({
        endpoint: `/api/companies/search?q=Name:"${name}"`
    });

    const { data } = response;

    if (data.length > 0) {
        return toCompany(data[0]);
    }

    return null;
}

export async function getOrCreateCompany(nango: NangoAction, name: string): Promise<Company> {
    const foundCompany = await getCompany(nango, name);

    if (foundCompany) {
        return foundCompany;
    }

    const company = await nango.post({
        endpoint: '/api/companies',
        data: [
            {
                Name: name
            }
        ]
    });

    return toCompany(company.data);
}
