import type { PotentialClient } from '../types';
import type { NangoAction, Lead } from '../../models';
import { getOrCreateCompany } from '../helpers/get-or-create-company.js';

export async function optionalsToPotentialClient(nango: NangoAction, input: Lead['federalAgency']): Promise<PotentialClient> {
    let companyId: number;
    if (!input.companyId) {
        const company = await getOrCreateCompany(nango, input);
        companyId = Number(company.id);
    } else {
        companyId = input.companyId;
    }

    const federalAgency: PotentialClient = {
        CompanyId: companyId,
        Name: input.name
    };

    if (input.externalId) {
        federalAgency.ExternalId = input.externalId;
    }

    if (input.acronym) {
        federalAgency.Acronym = input.acronym;
    }

    if (input.address1) {
        federalAgency.Address1 = input.address1;
    }

    if (input.address2) {
        federalAgency.Address2 = input.address2;
    }

    if (input.address3) {
        federalAgency.Address3 = input.address3;
    }

    if (input.city) {
        federalAgency.City = input.city;
    }

    if (input.state) {
        federalAgency.State = input.state;
    }

    if (input.zip) {
        federalAgency.zip = input.zip;
    }

    if (input.country) {
        federalAgency.Country = input.country;
    }

    if (input.isHeadquarters) {
        federalAgency.IsHeadquarters = input.isHeadquarters;
    }

    if (input.parentCompanyId) {
        federalAgency.ParentCompanyId = input.parentCompanyId;
    }

    if (input.parentCompanyName) {
        federalAgency.ParentCompanyName = input.parentCompanyName;
    }

    if (input.childCount) {
        federalAgency.ChildCount = input.childCount;
    }

    if (input.addrLat) {
        federalAgency.AddrLat = input.addrLat;
    }

    if (input.addrLong) {
        federalAgency.AddrLong = input.addrLong;
    }

    return federalAgency;
}

export function optionalsToFederalAgency(potentialClient: PotentialClient): Lead['federalAgency'] {
    const federalAgency: Lead['federalAgency'] = {
        companyId: potentialClient.CompanyId || 0,
        name: potentialClient.Name || ''
    };

    if (potentialClient.ExternalId) {
        federalAgency.externalId = potentialClient.ExternalId;
    }

    if (potentialClient.Acronym) {
        federalAgency.acronym = potentialClient.Acronym;
    }

    if (potentialClient.Address1) {
        federalAgency.address1 = potentialClient.Address1;
    }

    if (potentialClient.Address2) {
        federalAgency.address2 = potentialClient.Address2;
    }

    if (potentialClient.Address3) {
        federalAgency.address3 = potentialClient.Address3;
    }

    if (potentialClient.City) {
        federalAgency.city = potentialClient.City;
    }

    if (potentialClient.State) {
        federalAgency.state = potentialClient.State;
    }

    if (potentialClient.zip) {
        federalAgency.zip = potentialClient.zip;
    }

    if (potentialClient.Country) {
        federalAgency.country = potentialClient.Country;
    }

    if (potentialClient.IsHeadquarters) {
        federalAgency.isHeadquarters = potentialClient.IsHeadquarters;
    }

    if (potentialClient.ParentCompanyId) {
        federalAgency.parentCompanyId = potentialClient.ParentCompanyId;
    }

    if (potentialClient.ParentCompanyName) {
        federalAgency.parentCompanyName = potentialClient.ParentCompanyName;
    }

    if (potentialClient.ChildCount) {
        federalAgency.childCount = potentialClient.ChildCount;
    }

    if (potentialClient.AddrLat) {
        federalAgency.addrLat = potentialClient.AddrLat;
    }

    if (potentialClient.AddrLong) {
        federalAgency.addrLong = potentialClient.AddrLong;
    }

    return federalAgency;
}
