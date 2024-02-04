import type { ClariCopilotCall, NangoSync } from './models';

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const calls: any[] = await getAllCalls(nango);

        for (const Specificall of calls) {
            const call = await getSpecificCall(nango, Specificall.id);
            if (call) {
                const mappedCall: ClariCopilotCall = mapCall(call);

                totalRecords++;
                await nango.log(`Saving call for call ${call.id} (total call(s): ${totalRecords})`);
                await nango.batchSave([mappedCall], 'ClariCopilotCall');
            }
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

async function getAllCalls(nango: NangoSync) {
    const records: any[] = [];

    //first run to get all calls from the past 1 year
    const lastSyncDate = nango.lastSyncDate;
    const queryDate = lastSyncDate ? lastSyncDate.toISOString() : new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString();

    const config = {
        endpoint: '/calls',
        params: { filterTimeGt: queryDate }, // filter calls after lastSyncDate
        paginate: {
            type: 'offset',
            offset_name_in_request: 'skip',
            response_path: 'calls',
            limit_name_in_request: 'limit',
            limit: LIMIT
        }
    };

    for await (const recordBatch of nango.paginate(config)) {
        records.push(...recordBatch);
    }

    return records;
}

async function getSpecificCall(nango: NangoSync, callId: string) {
    try {
        const endpoint = `/call-details`;

        const call = await nango.get({
            endpoint,
            params: {
                id: callId,
                includeAudio: 'true',
                includeVideo: 'true'
            }
        });

        return mapCall(call.data.call);
    } catch (error: any) {
        throw new Error(`Error in getSpecificCall: ${error.message}`);
    }
}

function mapCall(call: any): ClariCopilotCall {
    return {
        id: call.id,
        source_id: call.source_id,
        title: call.title,
        users: call.users,
        externalParticipants: call.externalParticipants,
        status: call.status,
        bot_not_join_reason: call.bot_not_join_reason,
        type: call.type,
        time: call.time,
        icaluid: call.icaluid,
        calendar_id: call.calendar_id,
        recurring_event_id: call.recurring_event_id,
        original_start_time: call.original_start_time,
        last_modified_time: call.last_modified_time,
        audio_url: call.audio_url,
        video_url: call.video_url,
        disposition: call.disposition,
        deal_name: call.deal_name,
        deal_value: call.deal_value,
        deal_close_date: call.deal_close_date,
        deal_stage_before_call: call.deal_stage_before_call,
        account_name: call.account_name,
        contact_names: call.contact_names,
        crm_info: call.crm_info,
        bookmark_timestamps: call.bookmark_timestamps,
        metrics: call.metrics,
        call_review_page_url: call.call_review_page_url,
        deal_stage_live: call.deal_stage_live,
        transcript: call.transcript,
        summary: call.summary,
        competitor_sentiments: call.competitor_sentiments
    };
}
