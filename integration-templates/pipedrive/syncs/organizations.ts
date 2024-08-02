import type { PipeDriveOrganization, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/organizations/collection';
        const config = {
            ...(nango.lastSyncDate ? { params: { since: nango.lastSyncDate?.toISOString() } } : {}),
            paginate: {
                type: 'cursor',
                cursor_path_in_response: 'additional_data.next_cursor',
                cursor_name_in_request: 'cursor',
                limit_name_in_request: 'limit',
                response_path: 'data',
                limit: 100
            }
        };
        for await (const organization of nango.paginate({ ...config, endpoint })) {
            const mappedOrganization: PipeDriveOrganization[] = organization.map(mapOrganization) || [];
            // Save Organization
            const batchSize: number = mappedOrganization.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} organizations (total organizations: ${totalRecords})`);
            await nango.batchSave(mappedOrganization, 'PipeDriveOrganization');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapOrganization(organization: any): PipeDriveOrganization {
    return {
        id: organization.id,
        owner_id: organization.owner_id,
        name: organization.name,
        active_flag: organization.active_flag,
        update_time: organization.update_time,
        delete_time: organization.delete_time,
        add_time: organization.add_time,
        visible_to: organization.visible_to,
        label: organization.label,
        address: organization.address,
        address_subpremise: organization.address_subpremise,
        address_street_number: organization.address_street_number,
        address_route: organization.address_route,
        address_sublocality: organization.address_sublocality,
        address_locality: organization.address_locality,
        address_admin_area_level_1: organization.address_admin_area_level_1,
        address_admin_area_level_2: organization.address_admin_area_level_2,
        address_country: organization.address_country,
        address_postal_code: organization.address_postal_code,
        address_formatted_address: organization.address_formatted_address,
        cc_email: organization.cc_email
    };
}
