import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetIntegration, GetIntegrationFlows } from '@nangohq/types';
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

    const integration = await configService.getProviderConfig(params.providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const availablePublicFlows = flowService.getAllAvailableFlowsAsStandardConfig();
    const [template] = availablePublicFlows.filter((flow) => flow.providerConfigKey === integration.provider);
    const allFlows = await getSyncConfigsAsStandardConfig(environment.id, params.providerConfigKey);

    const dbFlows: NangoSyncConfig[] = [...(allFlows?.actions || []), ...(allFlows?.syncs || [])];
    const templateFlows: NangoSyncConfig[] = [...(template?.actions || []), ...(template?.syncs || [])];
    const finalFlows: NangoSyncConfig[] = [...dbFlows];

    // Find flows that could conflict with the templates
    // e.g: similar model or similar endpoint
    // A similar flow could be the same flow --and most of time is-- (e.g: a template that was enabled), but a customer could simply have a something different with the same endpoint
    for (const templateFlow of templateFlows) {
        const similar = hasSimilarFlow(templateFlow, dbFlows);
        if (similar) {
            if (templateFlow.version && templateFlow.version !== similar.version) {
                similar.upgrade_version = templateFlow.version;
            }
            continue;
        }

        finalFlows.push(templateFlow);
    }

    res.status(200).send({
        data: { flows: finalFlows as any }
    });
});

function containsSameEndpoint(flowA: NangoSyncConfig, flowB: NangoSyncConfig) {
    for (const endpointObjA of flowA.endpoints) {
        for (const endpointObjB of flowB.endpoints) {
            if (endpointObjB.method === endpointObjA.method && endpointObjB.path === endpointObjA.path) {
                return true;
            }
        }
    }
    return false;
}

function hasSimilarFlow(templateFlow: NangoSyncConfig, list: NangoSyncConfig[]): NangoSyncConfig | false {
    const modelsName = new Set<string>(templateFlow.returns.map((model) => model));

    for (const flow of list) {
        if (flow.type === templateFlow.type && flow.name === templateFlow.name) {
            return flow;
        }
        if (flow.type === 'sync' && templateFlow.type === 'sync' && flow.returns.find((model) => modelsName.has(model))) {
            return flow;
        }
        if (containsSameEndpoint(flow, templateFlow)) {
            return flow;
        }
    }
    return false;
}
