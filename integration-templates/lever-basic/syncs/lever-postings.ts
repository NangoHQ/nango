import type { LeverPosting, NangoSync } from '../../models';

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/postings';
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
        for await (const posting of nango.paginate({ ...config, endpoint })) {
            const mappedPosting: LeverPosting[] = posting.map(mapPosting) || [];

            const batchSize: number = mappedPosting.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} posting(s) (total posting(s): ${totalRecords})`);
            await nango.batchSave(mappedPosting, 'LeverPosting');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapPosting(posting: any): LeverPosting {
    return {
        id: posting.id,
        text: posting.text,
        createdAt: posting.createdAt,
        updatedAt: posting.updatedAt,
        user: posting.user,
        owner: posting.owner,
        hiringManager: posting.hiringManager,
        confidentiality: posting.confidentiality,
        categories: posting.categories,
        content: posting.content,
        country: posting.country,
        followers: posting.followers,
        tags: posting.tags,
        state: posting.state,
        distributionChannels: posting.distributionChannels,
        reqCode: posting.reqCode,
        requisitionCodes: posting.requisitionCodes,
        salaryDescription: posting.salaryDescription,
        salaryDescriptionHtml: posting.salaryDescriptionHtml,
        salaryRange: posting.salaryRange,
        urls: posting.urls,
        workplaceType: posting.workplaceType
    };
}
