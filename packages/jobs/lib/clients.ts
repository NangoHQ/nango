import { BigQueryClient } from '@nangohq/data-ingestion';
import { getFeatureFlagsClient } from '@nangohq/kvstore';
import { logContextGetter } from '@nangohq/logs';
import { OrchestratorClient } from '@nangohq/nango-orchestrator';
import { SlackService, getOrchestratorUrl } from '@nangohq/shared';
import { env } from '@nangohq/utils';

export const bigQueryClient = await BigQueryClient.createInstance({
    datasetName: 'raw',
    tableName: `${env}_script_runs`
});

export const orchestratorClient = new OrchestratorClient({ baseUrl: getOrchestratorUrl() });

export const slackService = new SlackService({
    logContextGetter: logContextGetter,
    featureFlags: await getFeatureFlagsClient()
});
