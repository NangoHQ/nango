import { BigQueryClient } from '@nangohq/data-ingestion';
import { logContextGetter } from '@nangohq/logs';
import { OrchestratorClient } from '@nangohq/nango-orchestrator';
import { Orchestrator, SlackService, getOrchestratorUrl } from '@nangohq/shared';
import { env } from '@nangohq/utils';

export const bigQueryClient = await BigQueryClient.createInstance({
    datasetName: 'raw',
    tableName: `${env}_script_runs`
});

export const orchestratorClient = new OrchestratorClient({ baseUrl: getOrchestratorUrl() });

export const slackService = new SlackService({
    orchestrator: new Orchestrator(orchestratorClient),
    logContextGetter: logContextGetter
});
