//import * as uuid from 'uuid';
import { Nango } from '@nangohq/node';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
//import md5 from 'md5';
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
    createActivityLog,
    createActivityLogMessageAndEnd,
    //DataResponse,
    LogLevel,
    LogAction,
    //getSyncConfigByProvider,
    //SyncConfig,
    getServerBaseUrl,
    updateSuccess as updateSuccessActivityLog
} from '@nangohq/shared';
//import type { GithubIssues, TicketModel } from './models/Ticket.js';
import type { NangoConnection, ContinuousSyncArgs, InitialSyncArgs } from './models/Worker';
//import { upsert } from './services/data.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

    return route(sync, nangoConnection, syncConfig, activityLogId, true);
}

export async function route(
    sync: Sync,
    nangoConnection: NangoConnection,
    syncConfig: ProviderConfig,
    activityLogId: number,
    isIncremental = false
): Promise<boolean> {
    let response = false;

    switch (syncConfig?.provider) {
        case 'github':
            response = await syncService('github', sync, nangoConnection, activityLogId, isIncremental);
            break;
        case 'asana':
            response = await syncService('asana', sync, nangoConnection, activityLogId, isIncremental);
            break;
    }

    return response;
}

export async function syncService(
    service: string,
    sync: Sync,
    nangoConnection: NangoConnection,
    existingActivityLogId: number,
    isIncremental: boolean
): Promise<boolean> {
    let activityLogId = existingActivityLogId;

    if (isIncremental) {
        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: 'sync' as LogAction,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoConnection?.connection_id as string,
            provider_config_key: nangoConnection?.provider_config_key as string,
            provider: service,
            session_id: sync.id.toString(),
            account_id: nangoConnection?.account_id as number
        };
        activityLogId = (await createActivityLog(log)) as number;
    }

    // look in the nango-integrations directory for any files start withing github
    const files = fs.readdirSync(path.resolve(__dirname, './nango-integrations'), 'utf8');

    const matchingFiles = files.filter((file) => {
        return file.startsWith(service) && file.endsWith('.js');
    });

    const [first] = matchingFiles;

    const integrationPath = `./nango-integrations/${first}` + `?v=${Math.random().toString(36).substring(3)}`;

    const { default: integrationCode } = await import(integrationPath);
    const integrationClass = new integrationCode();

    const nango = new Nango({
        host: getServerBaseUrl(),
        connectionId: String(nangoConnection?.connection_id),
        providerConfigKey: String(nangoConnection?.provider_config_key),
        // pass in the sync id and store the raw json in the database before the user does what they want with it
        // or use the connection ID to match it up
        // either way need a new table
        activityLogId: activityLogId as number
    });

    // store raw json for now
    const userDefinedResults = await integrationClass.fetchData(nango);
    console.log(userDefinedResults);

    const result = false;

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
        await updateSuccessActivityLog(activityLogId, false);

        await createActivityLogMessageAndEnd({
            level: 'error',
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: `The ${sync.type} sync did not complete successfully`
        });
    }

    return Boolean(result);
}

/*
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
*/
