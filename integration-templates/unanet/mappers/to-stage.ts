import type { Stage } from '../../models';
import type { UnanetStage } from '../types';

export function toStage(stage: UnanetStage): Stage {
    return {
        id: stage.StageID,
        name: stage.StageName,
        status: stage.StageType.StageTypeName
    };
}
