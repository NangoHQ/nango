import type { Stage, NangoAction } from '../../models';
import { toStage } from '../mappers/to-stage.js';

export async function findStage(nango: NangoAction, name: string): Promise<Stage | null> {
    const response = await nango.get({
        endpoint: `/api/opportunities/stage/search?q=StageName:"${name}"`
    });

    const { data } = response;

    if (data && data.length > 0) {
        return toStage(data[0]);
    }

    return null;
}
