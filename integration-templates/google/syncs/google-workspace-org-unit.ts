import type { NangoSync, OrganizationalUnit } from '../../models';

interface OrganizationUnit {
    kind: string;
    etag: string;
    name: string;
    description: string;
    orgUnitPath: string;
    orgUnitId: string;
    parentOrgUnitPath: string;
    parentOrgUnitId: string;
}
interface OrganizationUnitResponse {
    kind: string;
    etag: string;
    organizationUnits: OrganizationUnit[];
}

export default async function fetchData(nango: NangoSync): Promise<void> {
    const endpoint = '/admin/directory/v1/customer/my_customer/orgunits';
    let pageToken: string | undefined;

    const rootUnit: OrganizationalUnit = {
        name: '{Root Directory}',
        description: 'Root Directory',
        path: '/',
        id: '',
        parentPath: null,
        parentId: null,
        createdAt: null,
        deletedAt: null
    };

    do {
        const params = pageToken ? { type: 'all', pageToken } : { type: 'all' };

        const response = await nango.get<OrganizationUnitResponse & { nextPageToken?: string }>({
            baseUrlOverride: 'https://admin.googleapis.com',
            endpoint,
            params,
            retries: 5
        });

        if (!response) {
            await nango.log('No response from the Google API');
            return;
        }

        const { data } = response;

        if (data.organizationUnits) {
            if (
                !rootUnit.id &&
                data.organizationUnits.length > 0 &&
                data.organizationUnits[0]?.parentOrgUnitId &&
                data.organizationUnits[0]?.parentOrgUnitPath === '/'
            ) {
                rootUnit.id = data.organizationUnits[0].parentOrgUnitId;

                await nango.batchSave<OrganizationalUnit>([rootUnit], 'OrganizationalUnit');
            }

            const units: OrganizationalUnit[] = data.organizationUnits.map((ou: OrganizationUnit) => {
                const unit: OrganizationalUnit = {
                    name: ou.name,
                    description: ou.description,
                    path: ou.orgUnitPath,
                    id: ou.orgUnitId,
                    parentPath: ou.parentOrgUnitPath,
                    parentId: ou.parentOrgUnitId,
                    createdAt: null,
                    deletedAt: null
                };

                return unit;
            });

            await nango.batchSave<OrganizationalUnit>(units, 'OrganizationalUnit');
        }

        pageToken = response.data.nextPageToken;
    } while (pageToken);
}
