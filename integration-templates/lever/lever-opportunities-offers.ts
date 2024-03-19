import type { LeverOpportunityOffer, NangoSync } from './models';

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const opportunities: any[] = await getAllOpportunities(nango);

        for (const opportunity of opportunities) {
            const endpoint = `/v1/opportunities/${opportunity.id}/offers`;

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
            for await (const offer of nango.paginate({ ...config, endpoint })) {
                const mappedOffer: LeverOpportunityOffer[] = offer.map(mapOffer) || [];
                // Save offers
                const batchSize: number = mappedOffer.length;
                totalRecords += batchSize;
                await nango.log(`Saving batch of ${batchSize} offer(s) for opportunity ${opportunity.id} (total offers: ${totalRecords})`);
                await nango.batchSave(mappedOffer, 'LeverOpportunityOffer');
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

function mapOffer(offer: any): LeverOpportunityOffer {
    return {
        id: offer.id,
        createdAt: offer.createdAt,
        status: offer.status,
        creator: offer.creator,
        fields: offer.fields,
        sentDocument: offer.sentDocument,
        signedDocument: offer.signedDocument
    };
}
