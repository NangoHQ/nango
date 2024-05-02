import type { NangoSync, OrganizationalUnit } from '../../models';

interface OrganizationUnit {
    id: string;
    deletedDateTime: string | null;
    classification: string | null;
    createdDateTime: string;
    creationOptions: string[];
    description: string | null;
    displayName: string;
    expirationDateTime: string | null;
    groupTypes: string[];
    isAssignableToRole: string | null;
    mail: string;
    mailEnabled: boolean;
    mailNickname: string;
    membershipRule: string | null;
    membershipRuleProcessingState: string | null;
    onPremisesDomainName: string | null;
    onPremisesLastSyncDateTime: string | null;
    onPremisesNetBiosName: string | null;
    onPremisesSamAccountName: string | null;
    onPremisesSecurityIdentifier: string | null;
    onPremisesSyncEnabled: boolean | null;
    preferredDataLocation: string | null;
    preferredLanguage: string | null;
    proxyAddresses: string[];
    renewedDateTime: string;
    resourceBehaviorOptions: string[];
    resourceProvisioningOptions: string[];
    securityEnabled: boolean;
    securityIdentifier: string;
    theme: string | null;
    visibility: string;
    serviceProvisioningErrors: {
        createdDateTime?: string;
        isResolved?: boolean;
        serviceInstance?: string;
    }[];
    onPremisesProvisioningErrors: {
        category?: string;
        occurredDateTime?: string;
        propertyCausingError?: string;
        value?: string;
    }[];
}

interface OrganizationUnitResponse {
    '@odata.context': string;
    value: OrganizationUnit[];
    '@odata.nextLink'?: string;
}

export default async function fetchData(nango: NangoSync) {
    // https://learn.microsoft.com/en-us/graph/api/group-list-memberof?view=graph-rest-1.0&source=recommendations&tabs=http
    await fetchAndUpdateOrgs(nango, 'v1.0/groups');
    await fetchAndUpdateOrgs(nango, 'v1.0/directory/deletedItems/microsoft.graph.group', true);
}

async function fetchAndUpdateOrgs(nango: NangoSync, initialEndpoint: string, runDelete = false): Promise<void> {
    let endpoint = initialEndpoint;
    while (endpoint) {
        const deletedGroups: OrganizationalUnit[] = [] as OrganizationalUnit[];

        const { data }: { data: OrganizationUnitResponse } = await nango.get<OrganizationUnitResponse>({
            endpoint,
            retries: 5
        });

        if (!data) {
            await nango.log('No response from the Microsoft API');
            break;
        }

        const value = data.value;

        const units: OrganizationalUnit[] = [];

        for (const ou of value) {
            const unit: OrganizationalUnit = {
                id: ou.id,
                name: ou.displayName,
                createdAt: ou.createdDateTime,
                deletedAt: ou.deletedDateTime,
                path: null,
                parentId: null,
                parentPath: null,
                description: ou.description
            };

            if (!runDelete && unit.deletedAt) {
                deletedGroups.push(unit);

                continue;
            }

            units.push(unit);
        }

        if (runDelete) {
            await nango.batchDelete<OrganizationalUnit>(units, 'OrganizationalUnit');
        } else {
            await nango.batchSave<OrganizationalUnit>(units, 'OrganizationalUnit');

            if (deletedGroups.length) {
                await nango.batchDelete<OrganizationalUnit>(deletedGroups, 'OrganizationalUnit');
            }
        }

        endpoint = data['@odata.nextLink'] as string;
    }
}
