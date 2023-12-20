import type { PipeDriveDeal, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/deals/collection';
        const config = {
            ...(nango.lastSyncDate ? { params: { since: nango.lastSyncDate?.toISOString() } } : {}),
            paginate: {
                limit: 100
            }
        };
        for await (const deal of nango.paginate({ ...config, endpoint })) {
            const mappedDeal: PipeDriveDeal[] = deal.map(mapDeals) || [];

            // Save Deals
            const batchSize: number = mappedDeal.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} deals (total deals: ${totalRecords})`);
            await nango.batchSave(mappedDeal, 'PipeDriveDeal');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapDeals(deal: any): PipeDriveDeal {
    return {
        id: deal.id,
        creator_user_id: deal.creator_user_id,
        user_id: deal.user_id,
        person_id: deal.person_id,
        org_id: deal.org_id,
        stage_id: deal.stage_id,
        title: deal.title,
        value: deal.value,
        currency: deal.currency,
        add_time: deal.add_time,
        update_time: deal.update_time,
        status: deal.status,
        probability: deal.probability,
        lost_reason: deal.lost_reason,
        visible_to: deal.visible_to,
        close_time: deal.close_time,
        pipeline_id: deal.pipeline_id,
        won_time: deal.won_time,
        lost_time: deal.lost_time,
        expected_close_date: deal.expected_close_date,
        label: deal.label
    };
}
