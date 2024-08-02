import type { LeverOpportunityNote, NangoSync } from '../../models';

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const opportunities: any[] = await getAllOpportunities(nango);

        for (const opportunity of opportunities) {
            const endpoint = `/v1/opportunities/${opportunity.id}/notes`;

            const config = {
                paginate: {
                    type: 'cursor',
                    cursor_path_in_response: 'next',
                    cursor_name_in_request: 'offset',
                    limit_name_in_request: 'limit',
                    response_path: 'data',
                    limit: LIMIT
                }
            };
            for await (const note of nango.paginate({ ...config, endpoint })) {
                const mappedNote: LeverOpportunityNote[] = note.map(mapNote) || [];
                // Save notes
                const batchSize: number = mappedNote.length;
                totalRecords += batchSize;
                await nango.log(`Saving batch of ${batchSize} note(s) for opportunity ${opportunity.id} (total note(s): ${totalRecords})`);
                await nango.batchSave(mappedNote, 'LeverOpportunityNote');
            }
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

async function getAllOpportunities(nango: NangoSync) {
    const records: any[] = [];
    const config = {
        endpoint: '/v1/opportunities',
        paginate: {
            type: 'cursor',
            cursor_path_in_response: 'next',
            cursor_name_in_request: 'offset',
            limit_name_in_request: 'limit',
            response_path: 'data',
            limit: LIMIT
        }
    };

    for await (const recordBatch of nango.paginate(config)) {
        records.push(...recordBatch);
    }

    return records;
}

function mapNote(note: any): LeverOpportunityNote {
    return {
        id: note.id,
        text: note.text,
        fields: note.fields,
        user: note.user,
        secret: note.secret,
        completedAt: note.completedAt,
        createdAt: note.createdAt,
        deletedAt: note.deletedAt
    };
}
