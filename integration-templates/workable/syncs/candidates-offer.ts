import type { WorkableCandidateOffer, NangoSync } from '../../models';

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const candidates: any[] = await getAllCandidates(nango);

        for (const candidate of candidates) {
            const offer = await getCandidateOffer(nango, candidate.id);

            if (offer) {
                const mappedOffer: WorkableCandidateOffer = mapOffer(offer);

                totalRecords++;
                await nango.log(`Saving offer for candidate ${candidate.id} (total offers: ${totalRecords})`);
                await nango.batchSave([mappedOffer], 'WorkableCandidateOffer');
            }
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

async function getAllCandidates(nango: NangoSync) {
    const records: any[] = [];
    const proxyConfig = {
        endpoint: '/spi/v3/candidates',
        paginate: {
            type: 'link',
            link_path_in_response_body: 'paging.next',
            limit_name_in_request: 'limit',
            response_path: 'candidates',
            limit: LIMIT
        }
    };

    for await (const recordBatch of nango.paginate(proxyConfig)) {
        records.push(...recordBatch);
    }

    return records;
}

async function getCandidateOffer(nango: NangoSync, candidateId: string) {
    const endpoint = `/spi/v3/candidates/${candidateId}/offer`;

    //candidate's latest offer
    try {
        const offer = await nango.get({ endpoint });
        return mapOffer(offer.data);
    } catch (error: any) {
        throw new Error(`Error in getCandidateOffer: ${error.message}`);
    }
}

function mapOffer(offer: any): WorkableCandidateOffer {
    return {
        id: offer.candidate.id,
        candidate: offer.candidate,
        created_at: offer.created_at,
        document_variables: offer.document_variables,
        documents: offer.documents,
        state: offer.state
    };
}
