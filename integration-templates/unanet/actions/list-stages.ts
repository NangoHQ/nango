import type { NangoAction, Stage } from '../../models';
import type { UnanetStage } from '../types';
import { toStage } from '../mappers/to-stage.js';

export default async function runAction(nango: NangoAction, _input?: void): Promise<Stage[]> {
    const response = await nango.get<UnanetStage[]>({
        endpoint: '/api/opportunities/stage'
    });

    const { data } = response;

    return data.map(toStage);
}
