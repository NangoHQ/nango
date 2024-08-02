import type { CheckrTriggeredBackgroundCheck, BackgroundCheck } from '../../models';

export function toBackgroundCheck(check: CheckrTriggeredBackgroundCheck): BackgroundCheck {
    return {
        id: check.id,
        url: check.uri,
        status: check.status,
        candidate_id: check.candidate_id,
        service_key: check.package,
        created_at: check.created_at,
        expires_at: check.expires_at
    };
}
