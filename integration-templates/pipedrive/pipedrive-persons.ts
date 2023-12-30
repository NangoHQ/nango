import type { PipeDrivePerson, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/persons/collection';
        const config = {
            ...(nango.lastSyncDate ? { params: { since: nango.lastSyncDate?.toISOString() } } : {}),
            paginate: {
                limit: 100
            }
        };

        for await (const person of paginate(nango, endpoint, config)) {
            const mappedPerson: PipeDrivePerson[] = person.map(mapPerson) || [];
            const batchSize: number = mappedPerson.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} persons (total persons: ${totalRecords})`);
            await nango.batchSave(mappedPerson, 'PipeDrivePerson');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

async function* paginate(nango: NangoSync, endpoint: string, config?: any, queryParams?: Record<string, string | string[]>) {
    let cursor: string | undefined;
    let callParams = queryParams || {};

    while (true) {
        if (cursor) {
            callParams['cursor'] = `${cursor}`;
        }

        const resp = await nango.proxy({
            method: 'GET',
            endpoint: endpoint,
            params: {
                ...(config?.paginate?.limit && { limit: config.paginate.limit }),
                ...(config?.params?.since && { since: config.params.since }),
                ...callParams
            }
        });

        const persons = resp.data.data;

        if (!persons || persons.length === 0) {
            break;
        }

        yield persons;

        if (!resp.data.additional_data || !resp.data.additional_data.next_cursor) {
            break;
        } else {
            cursor = resp.data.additional_data.next_cursor;
        }
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
