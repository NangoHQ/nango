import type { Endpoints } from '@octokit/types';

export type GithubIssues = Endpoints['GET /repos/{owner}/{repo}/issues']['response']['data'];
