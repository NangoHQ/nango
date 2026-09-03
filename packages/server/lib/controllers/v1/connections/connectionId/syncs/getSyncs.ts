import * as z from 'zod';

import { records as recordsService } from '@nangohq/records';
import { connectionService, listConnectionSyncs } from '@nangohq/shared';
import { getLogger, requireEmptyBody, stringifyError, zodErrorToHTTP } from '@nangohq/utils';

import {
    connectionIdSchema,
    envSchema,
    paginationQueryFields,
    providerConfigKeySchema,
    searchQueryField,
    syncNameSchema,
    variantSchema
} from '../../../../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../../../utils/utils.js';

import type { ListedSync } from '@nangohq/shared';
import type { ApiConnectionSync, GetConnectionSyncs } from '@nangohq/types';

const logger = getLogger('connections.syncs');

const orchestrator = getOrchestrator();

const paramValidation = z
    .object({
        connectionId: connectionIdSchema
    })
    .strict();

const queryStringValidation = z
    .object({
        env: envSchema,
        provider_config_key: providerConfigKeySchema,
        search: searchQueryField,
        name: syncNameSchema.optional(),
        variant: variantSchema.optional(),
        ...paginationQueryFields
    })
    .strict();

export const getConnectionSyncs = asyncWrapperWithEnvironment<GetConnectionSyncs>(async (req, res) => {
    const emptyBody = requireEmptyBody(req as any);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const queryParamValues = queryStringValidation.safeParse(req.query);
    if (!queryParamValues.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryParamValues.error) } });
        return;
    }

    const paramValues = paramValidation.safeParse(req.params);
    if (!paramValues.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValues.error) } });
        return;
    }

    const { environment } = res.locals;
    const query = queryParamValues.data satisfies GetConnectionSyncs['Querystring'];
    const params = paramValues.data satisfies GetConnectionSyncs['Params'];

    const connection = await connectionService.getConnectionForPrivateApi({
        connectionId: params.connectionId,
        providerConfigKey: query.provider_config_key,
        environmentId: environment.id
    });

    if (connection.isErr()) {
        res.status(404).send({ error: { code: 'not_found', message: 'Failed to find connection' } });
        return;
    }

    const { syncs, total } = await listConnectionSyncs({
        connection: connection.value.connection,
        orchestrator,
        search: query.search,
        name: query.name,
        variant: query.variant,
        limit: query.limit,
        offset: query.page * query.limit
    });

    const recordCounts = await getRecordCountsForPage({ syncs, connectionId: connection.value.connection.id, environmentId: environment.id });

    res.status(200).send({
        data: syncs.map((sync) => toApi(sync, recordCounts)),
        pagination: { total, page: query.page, limit: query.limit }
    });
});

/** Counts are stored per `Model` / `Model::variant`, so only the page's own keys are fetched. */
async function getRecordCountsForPage({
    syncs,
    connectionId,
    environmentId
}: {
    syncs: ListedSync[];
    connectionId: number;
    environmentId: number;
}): Promise<Record<string, number> | null> {
    const models = new Set<string>();
    for (const sync of syncs) {
        for (const model of sync.models) {
            models.add(toRecordModelName(model, sync.variant));
        }
    }
    if (models.size === 0) {
        return {};
    }

    const counts = await recordsService.getCountsByModel({ connectionId, environmentId, models: [...models] });
    if (counts.isErr()) {
        logger.error(`Failed to get record counts for connection ${connectionId} in environment ${environmentId}: ${stringifyError(counts.error)}`);
        return null;
    }

    return Object.fromEntries(Object.entries(counts.value).map(([model, count]) => [model, count.count]));
}

function toRecordModelName(model: string, variant: string): string {
    return variant === 'base' ? model : `${model}::${variant}`;
}

function toApi(sync: ListedSync, recordCounts: Record<string, number> | null): ApiConnectionSync {
    return {
        id: sync.id,
        name: sync.name,
        variant: sync.variant,
        nango_connection_id: sync.nango_connection_id,
        sync_type: sync.sync_type,
        models: sync.models,
        frequency: sync.frequency,
        frequency_override: sync.frequency_override,
        schedule_status: sync.schedule_status,
        status: sync.status,
        futureActionTimes: sync.futureActionTimes,
        latest_sync:
            sync.job_id === null
                ? null
                : {
                      job_id: sync.job_id,
                      created_at: sync.job_created_at!.toISOString(),
                      updated_at: sync.job_updated_at!.toISOString(),
                      type: sync.job_type ?? 'INITIAL',
                      status: sync.job_status!,
                      result: sync.job_result,
                      sync_config_id: sync.job_sync_config_id!,
                      version: sync.job_version!,
                      models: sync.job_models ?? []
                  },
        active_logs: sync.error_log_id ? { log_id: sync.error_log_id } : null,
        record_count:
            recordCounts === null ? null : Object.fromEntries(sync.models.map((model) => [model, recordCounts[toRecordModelName(model, sync.variant)] ?? 0]))
    };
}
