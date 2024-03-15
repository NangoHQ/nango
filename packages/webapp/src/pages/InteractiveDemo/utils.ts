export enum Steps {
    Start = 0,
    Authorize = 1,
    Deploy = 2,
    Webhooks = 3,
    Fetch = 4,
    Write = 5,
    Complete = 6
}

export enum Language {
    Node = 0,
    cURL = 1
}

export const endpointSync = '/github/demo-issues';
export const endpointAction = '/github/demo-write-issue';
export const model = 'GithubIssueDemo';
export const providerConfigKey = 'github-demo';
export const actionName = 'github-create-demo-issue';
