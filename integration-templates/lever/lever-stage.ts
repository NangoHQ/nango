import type { LeverStage, NangoSync } from './models';

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/stages';
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
        for await (const stage of nango.paginate({ ...config, endpoint })) {
            const mappedStage: LeverStage[] = stage.map(mapStage) || [];

            const batchSize: number = mappedStage.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} stage(s) (total stage(s): ${totalRecords})`);
            await nango.batchSave(mappedStage, 'LeverStage');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapStage(stage: any): LeverStage {
    return {
        id: stage.id,
        text: stage.text
    };
}
