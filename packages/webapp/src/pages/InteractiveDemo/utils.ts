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

export const endpoint = '/github/lite-issues';
export const model = 'Issue';
export const providerConfigKey = 'github-demo';
