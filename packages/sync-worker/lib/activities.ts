import * as uuid from 'uuid';
import { Nango } from '@nangohq/node';
import md5 from 'md5';
import {
    getById as getSyncById,
    updateStatus as updateSyncStatus,
    create as createSync,
    Sync,
    SyncStatus,
    SyncType,
    Connection,
    Config as ProviderConfig,
    getConnectionById,
    configService,
    updateSuccess,
    createActivityLogMessageAndEnd,
    DataResponse,
    getSyncConfigByProvider,
    SyncConfig,
    getServerBaseUrl
} from '@nangohq/shared';
import type { GithubIssues, TicketModel } from './models/Ticket.js';
import type { NangoConnection, ContinuousSyncArgs, InitialSyncArgs } from './models/Worker';
import { upsert } from './services/data.service.js';

export async function syncActivity(name: string): Promise<string> {
    return `Synced, ${name}!`;
}

export async function routeSync(args: InitialSyncArgs): Promise<boolean> {
    const { syncId, activityLogId } = args;
    const sync: Sync = (await getSyncById(syncId)) as Sync;
    const nangoConnection = await getConnectionById(sync.nango_connection_id);
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number
    )) as ProviderConfig;
    return route(sync, nangoConnection as Connection, syncConfig, activityLogId);
}

export async function scheduleAndRouteSync(args: ContinuousSyncArgs): Promise<boolean> {
    const { nangoConnectionId, activityLogId } = args;
    const sync: Sync = (await createSync(nangoConnectionId, SyncType.INCREMENTAL)) as Sync;
    const nangoConnection: NangoConnection = (await getConnectionById(nangoConnectionId)) as NangoConnection;
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number
    )) as ProviderConfig;

    return route(sync, nangoConnection, syncConfig, activityLogId);
}

export async function route(sync: Sync, nangoConnection: NangoConnection, syncConfig: ProviderConfig, activityLogId: number): Promise<boolean> {
    let response = false;

    switch (syncConfig?.provider) {
        case 'github':
            response = await syncGithub(sync, nangoConnection, activityLogId);
            break;
        case 'asana':
            break;
    }

    return response;
}

export async function syncGithub(sync: Sync, nangoConnection: NangoConnection, activityLogId: number): Promise<boolean> {
    const nango = new Nango({ host: getServerBaseUrl() });

    if (!nango) {
        return false;
    }

    const [firstConfig] = (await getSyncConfigByProvider('github')) as SyncConfig[];
    const { integration_name: integrationName } = firstConfig as SyncConfig;
    const integrationPath = `../nango-integrations/${integrationName}.js` + `?v=${Math.random().toString(36).substring(3)}`;
    console.log(integrationPath);

    /*
     *
    const [firstConfig] = (await getSyncConfigByProvider(provider)) as SyncConfig[];
    const { integration_name: integrationName } = firstConfig as SyncConfig;
    const integrationPath = `../nango-integrations/${integrationName}.js` + `?v=${Math.random().toString(36).substring(3)}`;
    const { default: integrationCode } = await import(integrationPath);
    const integrationClass = new integrationCode();
    const nango = new Nango({
        host: 'http://localhost:3003',
        connectionId: String(nangoConnection?.connection_id),
        providerConfigKey: String(nangoConnection?.provider_config_key)
    });

    const userDefinedResults = await integrationClass.fetchData(nango);

     */

    const response = await nango.get({
        connectionId: nangoConnection?.connection_id as string,
        providerConfigKey: nangoConnection?.provider_config_key as string,
        headers: {
            'Nango-Proxy-Accept': 'application/vnd.github+json',
            'Nango-Proxy-X-Github-Api-Version-Id': '2022-11-18'
        },
        endpoint: 'repos/NangoHq/nango/issues'
    });

    if (!response) {
        return false;
    }

    const issues = formatGithubIssue(response.data as unknown as GithubIssues, nangoConnection?.id as number);
    const result = await upsert(issues as unknown as DataResponse[], '_nango_unified_tickets', 'external_id', nangoConnection?.id as number);
    console.log(result);

    if (result) {
        await updateSyncStatus(sync.id, SyncStatus.SUCCESS);
        await updateSuccess(activityLogId, true);

        await createActivityLogMessageAndEnd({
            level: 'info',
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: `The ${sync.type} sync has been completed`
        });
    } else {
        await createActivityLogMessageAndEnd({
            level: 'error',
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: `The ${sync.type} sync did not complete successfully`
        });
    }

    return Boolean(result);
}

function formatGithubIssue(issues: GithubIssues, nangoConnectionId: number): TicketModel[] {
    const models = [];
    for (const issue of issues) {
        const model = {
            id: uuid.v4(),
            external_id: issue.id, // this is stored as a string, b/c this could be a uuid or even an email address
            title: issue.title,
            description: issue.body as string,
            status: issue.state, // TODO modify this to fit the enum
            external_raw_status: issue.state,
            number_of_comments: issue.comments,
            comments: issue.comments, // TODO fetch comments
            creator: issue?.user?.login as string, // do a more thorough lookup?
            external_created_at: issue.created_at,
            external_updated_at: issue.updated_at,
            deleted_at: null,
            raw_json: issue,
            data_hash: md5(JSON.stringify(issue)),
            nango_connection_id: nangoConnectionId
        };
        models.push(model);
    }
    return models;
}
