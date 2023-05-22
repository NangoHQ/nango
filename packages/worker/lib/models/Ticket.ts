import type { Endpoints } from '@octokit/types';

export type GithubIssues = Endpoints['GET /repos/{owner}/{repo}/issues']['response']['data'];

export interface BaseModel {
    raw_json: object;
    data_hash: string;
    nango_connection_id: number;
}
export interface TicketModel extends BaseModel {
    id?: string;
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
