import { randomUUID } from 'node:crypto';

import * as z from 'zod';

import db from '@nangohq/database';
import { configService, connectionService, getApiUrl, getSyncConfigRaw, localFileService, remoteFileService, secretService } from '@nangohq/shared';
import { integrationFilesAreRemote, isCloud, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { sendSfStepError } from './helpers.js';
import { connectionIdSchema, providerConfigKeySchema, syncNameSchema } from '../../helpers/validation.js';
import { executeDryRun } from '../../services/sf/dryrun.service.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { NangoProps, PostSfRun } from '@nangohq/types';

const schemaBody = z
    .object({
        integration_id: providerConfigKeySchema,
        function_name: syncNameSchema,
        function_type: z.enum(['action', 'sync']),
        connection_id: connectionIdSchema,
        environment: z.string().min(1),
        input: z.unknown().optional(),
        test_input: z.unknown().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        checkpoint: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        last_sync_date: z.string().datetime().optional()
    })
    .strict();

const defaultRunnerFlags: NangoProps['runnerFlags'] = {
    validateActionInput: false,
    validateActionOutput: false,
    validateSyncRecords: false,
    validateSyncMetadata: false
};

export const postSfRun = asyncWrapper<PostSfRun>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = schemaBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body = valBody.data;
    const { account, environment } = res.locals;

    if (body.environment !== environment.name) {
        res.status(400).send({
            error: {
                code: 'environment_mismatch',
                message: `Environment '${body.environment}' does not match authenticated environment '${environment.name}'`
            }
        } as any);
        return;
    }

    const connectionResult = await connectionService.getConnection(body.connection_id, body.integration_id, environment.id);
    if (!connectionResult.success || !connectionResult.response) {
        sendSfStepError({
            res,
            step: 'lookup',
            status: 404,
            error: {
                type: 'unknown_connection',
                message: `Connection '${body.connection_id}' was not found for integration '${body.integration_id}'`
            }
        });
        return;
    }

    const providerConfig = await configService.getProviderConfig(body.integration_id, environment.id);
    if (!providerConfig || !providerConfig.id) {
        sendSfStepError({
            res,
            step: 'lookup',
            status: 404,
            error: {
                type: 'unknown_provider',
                message: `Integration '${body.integration_id}' was not found in environment '${environment.name}'`
            }
        });
        return;
    }

    const syncConfig = await getSyncConfigRaw({
        environmentId: environment.id,
        config_id: providerConfig.id,
        name: body.function_name,
        isAction: body.function_type === 'action'
    });

    if (!syncConfig) {
        sendSfStepError({
            res,
            step: 'lookup',
            status: 404,
            error: {
                type: 'not_found',
                message: `Function '${body.function_name}' is not deployed for integration '${body.integration_id}'`
            }
        });
        return;
    }

    if (!syncConfig.enabled) {
        sendSfStepError({
            res,
            step: 'lookup',
            status: 404,
            error: {
                type: 'disabled_resource',
                message: `Function '${body.function_name}' is currently disabled`
            }
        });
        return;
    }

    let scriptCode: string | null = null;
    try {
        scriptCode =
            isCloud || integrationFilesAreRemote
                ? await remoteFileService.getFile(syncConfig.file_location)
                : localFileService.getIntegrationFile({
                      syncConfig,
                      providerConfigKey: body.integration_id,
                      scriptType: body.function_type
                  });
    } catch (err) {
        sendSfStepError({
            res,
            step: 'lookup',
            status: 500,
            error: err
        });
        return;
    }

    if (!scriptCode) {
        sendSfStepError({
            res,
            step: 'lookup',
            status: 404,
            error: {
                type: 'integration_file_not_found',
                message: `No deployed bundle was found for '${body.function_name}'`
            }
        });
        return;
    }

    const defaultSecret = await secretService.getDefaultSecretForEnv(db.readOnly, environment.id);
    if (defaultSecret.isErr()) {
        sendSfStepError({
            res,
            step: 'lookup',
            status: 500,
            error: defaultSecret.error
        });
        return;
    }

    const lastSyncDate = body.last_sync_date ? new Date(body.last_sync_date) : undefined;
    const nangoProps: NangoProps = {
        scriptType: body.function_type,
        host: getApiUrl(),
        team: {
            id: account.id,
            name: account.name
        },
        connectionId: connectionResult.response.connection_id,
        environmentId: environment.id,
        environmentName: environment.name,
        providerConfigKey: body.integration_id,
        provider: providerConfig.provider,
        activityLogId: randomUUID(),
        secretKey: defaultSecret.value.secret,
        nangoConnectionId: connectionResult.response.id,
        syncId: body.function_type === 'sync' ? `sf-run-${syncConfig.id}` : undefined,
        syncVariant: body.function_type === 'sync' ? 'base' : undefined,
        syncJobId: body.function_type === 'sync' ? -1 : undefined,
        attributes: syncConfig.attributes,
        track_deletes: syncConfig.track_deletes,
        syncConfig,
        debug: false,
        logger: { level: 'off' },
        runnerFlags: defaultRunnerFlags,
        startedAt: new Date(),
        ...(lastSyncDate ? { lastSyncDate } : {}),
        endUser: null,
        heartbeatTimeoutSecs: 30,
        integrationConfig: {
            oauth_client_id: providerConfig.oauth_client_id,
            oauth_client_secret: providerConfig.oauth_client_secret
        }
    };

    const execution = await executeDryRun({
        code: scriptCode,
        compiledScriptPath: `build/${body.integration_id}_${body.function_type}s_${body.function_name}.cjs`,
        nangoProps,
        ...(body.function_type === 'action' ? { testInput: body.test_input ?? body.input } : {}),
        ...(body.function_type === 'sync' ? { metadata: body.metadata as any, checkpoint: body.checkpoint as any } : {})
    });

    if (!execution.success) {
        sendSfStepError({
            res,
            step: 'execution',
            status: execution.error.status,
            error: execution.error
        });
        return;
    }

    if (execution.response.functionType === 'action') {
        res.status(200).send({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: 'action',
            output: execution.response.output,
            proxy_calls: execution.response.proxyCalls
        });
        return;
    }

    res.status(200).send({
        integration_id: body.integration_id,
        function_name: body.function_name,
        function_type: 'sync',
        changes: execution.response.changes,
        proxy_calls: execution.response.proxyCalls
    });
});
