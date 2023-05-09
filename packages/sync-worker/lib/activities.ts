import * as uuid from 'uuid';
import { Nango } from '@nangohq/node';
import db from './db/database.js';
import type { Sync } from '@nangohq/nango-server/dist/models.js';
import type { GithubIssues } from './models/Ticket.js';
import { getById } from '@nangohq/nango-server/dist/services/sync.service.js';
import configService from '@nangohq/nango-server/dist/services/config.service.js';
import { createOrUpdate as createOrUpdateTicket } from './services/ticket.service.js';

export function getServerPort() {
    return process.env['SERVER_PORT'] != null ? +process.env['SERVER_PORT'] : 3003;
}

function getServerHost() {
    return process.env['SERVER_HOST'] || process.env['SERVER_RUN_MODE'] === 'DOCKERIZED' ? 'http://nango-server' : 'http://localhost';
}

export function getServerBaseUrl() {
    return getServerHost() + `:${getServerPort()}`;
}

export async function syncActivity(name: string): Promise<string> {
    return `Synced, ${name}!`;
}

export async function routeSync(syncId: number): Promise<boolean> {
    const sync: Sync = (await getById(syncId, db)) as Sync;
    const syncConfig = await configService.getProviderConfig(sync?.provider_config_key, sync?.account_id, db);

    let response = false;

    switch (syncConfig?.provider) {
        case 'github':
            response = await syncGithub(sync);
            break;
        case 'asana':
            break;
    }

    return response;
}

export async function syncGithub(sync: Sync): Promise<boolean> {
    const nango = new Nango({ host: getServerBaseUrl() });

    if (!nango) {
        return false;
    }

    // TODO doesnt work for a user, incorrect scopes
    // TODO environment variables aren't picked up correctly
    const response = await nango.get({
        connectionId: sync?.connection_id as string,
        providerConfigKey: sync?.provider_config_key as string,
        headers: {
            'Nango-Proxy-Accept': 'application/vnd.github+json',
            'Nango-Proxy-X-Github-Api-Version-Id': '2022-11-18'
        },
        endpoint: 'repos/NangoHq/nango/issues'
    });

    if (response) {
        insertModel(response.data as unknown as GithubIssues);
    }

    return true;
}

async function insertModel(issues: GithubIssues): Promise<boolean> {
    let result = true;
    const models = [];
    for (const issue of issues) {
        const model = {
            id: uuid.v4(),
            external_id: issue.id,
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
            raw_json: issue
        };
        models.push(model);

        const insert = await createOrUpdateTicket(model);

        if (!insert) {
            result = false;
        }
    }

    return result;
}
