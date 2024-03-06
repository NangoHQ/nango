export enum Steps {
    Authorize = 0,
    Sync = 1,
    Receive = 2,
    Write = 3,
    Ship = 4,
    Complete = 5
}

export enum Language {
    Node = 0,
    cURL = 1,
    Python = 2,
    PHP = 3,
    Go = 4,
    Java = 5
}

export const endpoint = '/github/lite-issues';
export const model = 'Issue';
export const providerConfigKey = 'demo-github-integration';
