import type { NangoSync, TeamtailorCandidate } from './models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/candidates';
        const config = {
            paginate: {
                type: 'link',
                link_path_in_response_body: 'links.next',
                limit_name_in_request: 'page[size]',
                response_path: 'data',
                limit: 100
            }
        };
        for await (const candidate of nango.paginate({ ...config, endpoint })) {
            const mappedCandidate: TeamtailorCandidate[] = candidate.map(mapCandidate) || [];

            const batchSize: number = mappedCandidate.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} candidate(s) (total candidate(s): ${totalRecords})`);
            await nango.batchSave(mappedCandidate, 'TeamtailorCandidate');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapCandidate(candidate: any): TeamtailorCandidate {
    return {
        id: candidate.id,
        type: candidate.type,
        links: candidate.links,
        attributes: candidate.attributes,
        relationships: candidate.relationships
    };
}
