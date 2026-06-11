import { configService, findActiveDeployedMeta, flowService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { toNangoFunction } from '../../../../../formatters/function.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { validationParams } from '../getIntegration.js';

import type { DeployedMeta, GetIntegrationTemplates, NangoFunctionTemplate } from '@nangohq/types';

export const getIntegrationTemplates = asyncWrapper<GetIntegrationTemplates>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const { providerConfigKey } = valParams.data;

    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const all = flowService.getAllAvailableFlowsAsStandardConfig();
    const entry = all.find((value) => value.providerConfigKey === integration.provider);

    const deployedRows = await findActiveDeployedMeta({ environmentId: environment.id, providerConfigKey });
    const deployedByKey = new Map<string, DeployedMeta>(
        deployedRows.map((row) => [
            `${row.type}:${row.name}`,
            { id: row.id, enabled: row.enabled, last_deployed: row.last_deployed.toISOString(), source: row.source }
        ])
    );

    const data: NangoFunctionTemplate[] = entry
        ? [...entry.actions, ...entry.syncs].flatMap((e) => {
              const fn = toNangoFunction(e);
              if (!fn) {
                  return [];
              }
              const deployed = deployedByKey.get(`${fn.type}:${fn.name}`);
              return [deployed ? { ...fn, deployed } : fn];
          })
        : [];

    res.status(200).send({ data });
});
