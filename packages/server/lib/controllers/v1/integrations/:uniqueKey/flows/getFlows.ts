import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetIntegration, GetIntegrationFlows, HTTP_VERB } from '@nangohq/types';
import type { NangoSyncConfig } from '@nangohq/shared';
import { configService, flowService, getSyncConfigsAsStandardConfig } from '@nangohq/shared';
import { validationParams } from '../getIntegration.js';

export const getIntegrationFlows = asyncWrapper<GetIntegrationFlows>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) }
        });
        return;
    }

    const { environment } = res.locals;
    const params: GetIntegration['Params'] = valParams.data;

    const integration = await configService.getProviderConfig(params.integrationId, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const availablePublicFlows = flowService.getAllAvailableFlowsAsStandardConfig();
    const [template] = availablePublicFlows.filter((flow) => flow.providerConfigKey === integration.provider);
    const allFlows = await getSyncConfigsAsStandardConfig(environment.id, params.integrationId);

    const dbFlows: NangoSyncConfig[] = [...(allFlows?.actions || []), ...(allFlows?.syncs || [])];
    const templateFlows: NangoSyncConfig[] = [...(template?.actions || []), ...(template?.syncs || [])];
    const finalFlows: NangoSyncConfig[] = [...dbFlows];

    for (const templateFlow of templateFlows) {
        if (hasSimilarFlow(templateFlow, dbFlows)) {
            continue;
        }

        finalFlows.push(templateFlow);
    }

    res.status(200).send({
        data: {
            flows: finalFlows as any
        }
    });
});

function containsSameEndpoint(flowA: NangoSyncConfig, flowB: NangoSyncConfig) {
    for (const endpointObjA of flowA.endpoints) {
        const endpointA = Object.entries(endpointObjA) as unknown as [HTTP_VERB, string];

        for (const endpointObjB of flowB.endpoints) {
            if (endpointObjB[endpointA[0]] && endpointObjB[endpointA[0]] === endpointA[1]) {
                return true;
            }
        }
    }
    return false;
}
function hasSimilarFlow(flow: NangoSyncConfig, list: NangoSyncConfig[]) {
    const modelsName = new Set<string>(flow.models.map((model) => model.name));
    for (const flow of list) {
        if (flow.type === flow.type && flow.name === flow.name) {
            return true;
        }
        if (flow.type === 'sync' && flow.models.find((model) => modelsName.has(model.name))) {
            return true;
        }
        if (containsSameEndpoint(flow, flow)) {
            return true;
        }

        return false;
    }
    return false;
}
