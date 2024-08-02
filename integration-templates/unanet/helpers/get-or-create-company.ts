import type { Company, Lead, NangoAction } from '../../models';
import type { UnanetCompanyWithRequiredName } from '../types';
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

export async function getOrCreateCompany(nango: NangoAction, federalAgency: Lead['federalAgency']): Promise<Company> {
    const foundCompany = await getCompany(nango, federalAgency.name);

    if (foundCompany) {
        return foundCompany;
    }

    const unanetCompany: UnanetCompanyWithRequiredName = {
        Name: federalAgency.name
    };

    if (federalAgency?.externalId) {
        unanetCompany.ExternalId = federalAgency.externalId;
    }

    if (federalAgency?.acronym) {
        unanetCompany.Acronym = federalAgency.acronym;
    }

    if (federalAgency?.address1) {
        unanetCompany.Addresses = [
            {
                AddressTypeName: federalAgency.name,
                Address1: federalAgency.address1
            }
        ];
    }

    if (federalAgency?.city) {
        if (unanetCompany.Addresses && unanetCompany.Addresses.length > 0 && unanetCompany.Addresses[0]) {
            unanetCompany.Addresses[0].City = federalAgency.city;
        } else {
            unanetCompany.Addresses = [
                {
                    AddressTypeName: federalAgency.name,
                    City: federalAgency.city
                }
            ];
        }
    }

    if (federalAgency?.country) {
        if (unanetCompany.Addresses && unanetCompany.Addresses.length > 0 && unanetCompany.Addresses[0]) {
            unanetCompany.Addresses[0].CountryName = federalAgency.country;
        } else {
            unanetCompany.Addresses = [
                {
                    AddressTypeName: federalAgency.name,
                    CountryName: federalAgency.country
                }
            ];
        }
    }

    if (federalAgency?.zip) {
        if (unanetCompany.Addresses && unanetCompany.Addresses.length > 0 && unanetCompany.Addresses[0]) {
            unanetCompany.Addresses[0].PostalCode = federalAgency.zip;
        } else {
            unanetCompany.Addresses = [
                {
                    AddressTypeName: federalAgency.name,
                    PostalCode: federalAgency.zip
                }
            ];
        }
    }

    const company = await nango.post({
        endpoint: '/api/companies',
        data: [unanetCompany]
    });

    return toCompany(company.data[0]);
}
