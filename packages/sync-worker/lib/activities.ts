import * as uuid from 'uuid';
import { Nango } from '@nangohq/node';
import { getById } from '@nangohq/nango-server/dist/services/sync.service.js';
import db from './db/database.js';
import type { Endpoints } from '@octokit/types';

type IssuesListForRepoResponseData = Endpoints['GET /repos/{owner}/{repo}/issues']['response']['data'];

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

export async function syncGithub(syncId: number): Promise<boolean> {
    const sync = await getById(syncId);
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
        insertModel(response.data as unknown as IssuesListForRepoResponseData);
    }

    return true;
}

interface TicketModel {
    id: string;
    external_id: number;
    title: string;
    description: string;
    status: string; // TODO enum
    external_raw_status: string;
    number_of_comments: number;
    comments: number;
    creator: string;
    external_created_at: string;
    external_updated_at: string;
    deleted_at: string | null;
}

async function insertModel(response: IssuesListForRepoResponseData): Promise<boolean> {
    const models = [];
    console.log(response);
    for (const issue of response) {
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
            deleted_at: null
        };
        models.push(model);
        const result: void | Pick<TicketModel, 'id'> = await db.knex.withSchema(db.schema()).from<TicketModel>('_nango_unified_tickets').insert(model);
        console.log(result);
    }

    return true;
}
