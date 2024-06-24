import type { Location, CheckrTriggeredBackgroundCheck, TriggeredBackgroundCheck, TriggerBackgroundCheckInput } from '../../models';

interface TriggerBackgroundCheckForCheckr {
    candidate_id: string;
    package: string;
    work_locations?: Location[];
    node?: TriggerBackgroundCheckInput['node'];
    tags?: TriggerBackgroundCheckInput['tags'];
}

export function toTriggeredBackgroundCheck(triggeredBackgroundCheck: CheckrTriggeredBackgroundCheck): TriggeredBackgroundCheck {
    return {
        applicationId: triggeredBackgroundCheck.id,
        url: triggeredBackgroundCheck.uri,
        status: triggeredBackgroundCheck.status,
        completed_at: triggeredBackgroundCheck.completed_at,
        candidate_id: triggeredBackgroundCheck.candidate_id,
        service_key: triggeredBackgroundCheck.package,
        deleted_at: triggeredBackgroundCheck.deleted_at,
        created_at: triggeredBackgroundCheck.created_at,
        updated_at: triggeredBackgroundCheck.updated_at
    };
}

export function toTriggerCheckrBackgroundCheck(bgCheck: TriggerBackgroundCheckInput): TriggerBackgroundCheckForCheckr {
    const backgroundCheck: TriggerBackgroundCheckForCheckr = {
        candidate_id: bgCheck.candidate_id,
        package: bgCheck.service_key
    };

    if (bgCheck.country) {
        const work_locations: Location = {
            country: bgCheck.country
        };

        if (bgCheck.state) {
            work_locations.state = bgCheck.state;
        }

        if (bgCheck.city) {
            work_locations.city = bgCheck.city;
        }
        backgroundCheck.work_locations = [work_locations];
    }

    if (bgCheck.node) {
        backgroundCheck.node = bgCheck.node;
    }

    if (bgCheck.tags) {
        backgroundCheck.tags = bgCheck.tags;
    }

    return backgroundCheck;
}
