import * as z from 'zod';

import { getLocking } from '@nangohq/kvstore';
import { logContextGetter } from '@nangohq/logs';
import { NangoError, cleanIncomingFlow, deploy, localFileService, syncManager } from '@nangohq/shared';
import { NANGO_VERSION, integrationFilesAreRemote, isCloud, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { sendSfStepError } from './helpers.js';
import { providerConfigKeySchema, syncNameSchema } from '../../helpers/validation.js';
import { SfCompilerError, invokeCompiler } from '../../services/sf/compiler-client.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { Lock } from '@nangohq/kvstore';
import type { PostSfDeploy } from '@nangohq/types';

const schemaBody = z
    .object({
        integration_id: providerConfigKeySchema,
        function_name: syncNameSchema,
        function_type: z.enum(['action', 'sync']),
        code: z.string().min(1),
        environment: z.string().min(1)
    })
    .strict();

const orchestrator = getOrchestrator();

export const postSfDeploy = asyncWrapper<PostSfDeploy>(async (req, res) => {
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

    let lock: Lock | undefined;
    let locking: Awaited<ReturnType<typeof getLocking>> | null = null;

    try {
        let bundledJs: string;
        let flow: Awaited<ReturnType<typeof invokeCompiler>>['flow'];

        try {
            ({ bundledJs, flow } = await invokeCompiler({
                integration_id: body.integration_id,
                function_name: body.function_name,
                function_type: body.function_type,
                code: body.code
            }));
        } catch (err) {
            sendSfStepError({
                res,
                step: 'compilation',
                error: err,
                status: err instanceof SfCompilerError ? 400 : 500
            });
            return;
        }

        if (!isCloud && !integrationFilesAreRemote) {
            const localBuildFile = `build/${body.integration_id}_${body.function_type}s_${body.function_name}.cjs`;
            const persisted = localFileService.putIntegrationFile({
                filePath: localBuildFile,
                fileContent: bundledJs
            });
            if (!persisted) {
                throw new Error(`Failed to persist compiled bundle locally at '${localBuildFile}'`);
            }
        }

        locking = await getLocking();

        const ttlMs = 60 * 1000;
        const lockKey = `lock:deployService:deploy:${account.id}:${environment.id}`;
        try {
            lock = await locking.acquire(lockKey, ttlMs);
        } catch {
            throw new NangoError('concurrent_deployment');
        }

        const deploymentResult = await deploy({
            environment,
            account,
            flows: cleanIncomingFlow([flow]),
            nangoYamlBody: '',
            logContextGetter,
            orchestrator,
            debug: false,
            sdkVersion: `${NANGO_VERSION}-zero`
        });

        if (!deploymentResult.success || !deploymentResult.response) {
            sendSfStepError({
                res,
                step: 'deployment',
                error: deploymentResult.error || new Error('Failed to deploy function')
            });
            return;
        }

        const deployed = deploymentResult.response.result[0];
        if (!deployed) {
            sendSfStepError({
                res,
                step: 'deployment',
                error: new Error('Deployment finished but no deployment result was returned')
            });
            return;
        }

        if (body.function_type === 'sync') {
            deployed.runs = flow.runs;
            await syncManager.triggerIfConnectionsExist({
                flows: [deployed],
                environmentId: environment.id,
                logContextGetter,
                orchestrator
            });
        }

        res.status(200).send({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            deployment: deployed
        });
    } catch (err) {
        sendSfStepError({ res, step: 'deployment', error: err });
    } finally {
        if (lock && locking) {
            await locking.release(lock);
        }
    }
});
