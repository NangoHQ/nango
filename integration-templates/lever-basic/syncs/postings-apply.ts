import type { LeverPostingApply, NangoSync } from '../../models';

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const postings: any[] = await getAllPostings(nango);

        for (const posting of postings) {
            const apply = await getPostingApply(nango, posting.id);
            if (apply) {
                const mappedApply: LeverPostingApply = mapApply(apply);

                totalRecords++;
                await nango.log(`Saving apply for posting ${posting.id} (total applie(s): ${totalRecords})`);
                await nango.batchSave([mappedApply], 'LeverPostingApply');
            }
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

async function getAllPostings(nango: NangoSync) {
    const records: any[] = [];
    const config = {
        endpoint: '/v1/postings',
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

async function getPostingApply(nango: NangoSync, postingId: string) {
    const endpoint = `/v1/postings/${postingId}/apply`;
    try {
        const apply = await nango.get({ endpoint });
        return mapApply(apply.data.data);
    } catch (error: any) {
        throw new Error(`Error in getPostingApply: ${error.message}`);
    }
}

function mapApply(apply: any): LeverPostingApply {
    return {
        id: apply.id,
        text: apply.text,
        customQuestions: apply.customQuestions,
        eeoQuestions: apply.eeoQuestions,
        personalInformation: apply.personalInformation,
        urls: apply.urls
    };
}
