import type { NangoAction, CheckrTriggeredBackgroundCheck, TriggeredBackgroundCheck, TriggerBackgroundCheckInput } from '../../models';
import { constructRequest } from '../helpers/construct-request.js';
import { toTriggeredBackgroundCheck, toTriggerCheckrBackgroundCheck } from '../mappers/to-triggered-background-check.js';

export default async function runAction(nango: NangoAction, input: TriggerBackgroundCheckInput): Promise<TriggeredBackgroundCheck> {
    if (!input?.candidate_id) {
        throw new nango.ActionError({
            message: `candidate_id is missing`
        });
    }

    if (!input?.service_key) {
        throw new nango.ActionError({
            message: `service_key is missing which is the package slug to trigger the background check`
        });
    }

    const connection = await nango.getConnection();
    const accountHierarchyEnabled = connection.connection_config['accountHierarchyEnabled'] || false;

    if (!input?.country) {
        throw new nango.ActionError({
            message: `country is missing. This is required when account hierarchy is enabled.`
        });
    }

    if (accountHierarchyEnabled && input.country === 'US' && !input?.state) {
        throw new nango.ActionError({
            message: `state is missing. This is required when account hierarchy is enabled and the country is US.`
        });
    }

    if (accountHierarchyEnabled && !input?.node) {
        throw new nango.ActionError({
            message: `node is missing. This is required when account hierarchy is enabled.`
        });
    }

    const config = await constructRequest(nango, '/v1/invitations');

    const response = await nango.post<CheckrTriggeredBackgroundCheck>({
        ...config,
        data: toTriggerCheckrBackgroundCheck(input)
    });

    return toTriggeredBackgroundCheck(response.data);
}
