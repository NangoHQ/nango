import type { PipeDrivePerson, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/persons/collection';
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
        for await (const person of nango.paginate({ ...config, endpoint })) {
            const mappedPerson: PipeDrivePerson[] = person.map(mapPerson) || [];
            // Save Person
            const batchSize: number = mappedPerson.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} persons (total persons: ${totalRecords})`);
            await nango.batchSave(mappedPerson, 'PipeDrivePerson');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapPerson(person: any): PipeDrivePerson {
    return {
        id: person.id,
        active_flag: person.active_flag,
        owner_id: person.owner_id,
        org_id: person.org_id,
        name: person.name,
        phone: person.phone,
        email: person.email,
        update_time: person.update_time,
        delete_time: person.delete_time,
        add_time: person.add_time,
        visible_to: person.visible_to,
        picture_id: person.picture_id,
        label: person.picture_id,
        cc_email: person.cc_email
    };
}
