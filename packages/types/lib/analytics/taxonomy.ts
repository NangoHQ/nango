export type AnalyticsSurface = 'web' | 'cli' | 'server';

export interface AnalyticsCategories {
    auth: 'Signing up, logging in and account access';
    audit: "The account's audit trail: who did what in the account. Not function logs";
    onboarding: 'Getting Started';
    connections: 'Creating and managing connections';
    playground: 'The dashboard Playground';
    functions: 'Writing, deploying and running syncs and actions, including from the CLI';
    billing: 'Plans, usage and payment';
    agents: 'Agent sessions and the tools agents call through them';
}

export interface AnalyticsObjects {
    account: 'A Nango account';
    user: 'A person in an account';
    connection: "An end user's authorised link to an integration";
    integration: 'A provider configured in an environment. Never `provider`';
    deploy: 'Pushing functions to an environment';
    command: 'A CLI command, such as `compile` or `deploy`';
    function: 'A sync or an action';
    run: 'One execution of a function';
    api_key: 'An account or environment key';
    environment: 'Dev, prod or a custom environment';
    plan: "The account's pricing plan";
    session: 'An agent session';
    tool_call: 'One call an agent makes to a tool in its session';
    proxy_request: "One request an agent sends to an integration's API through the proxy";
    tool_search: 'One search an agent runs for tools in its session';
    usage: "The Usage page's metrics and charts";
    playground: 'The dashboard Playground panel';
    two_factor: "A user's two-factor authentication";
    recovery_codes: "A user's two-factor recovery codes";
    password: "A user's password";
    join_request: 'A request to join an existing account';
    export: 'A file of records produced for download, such as the audit trail';
}

export interface AnalyticsUiElements {
    button: 'A dashboard button, such as `create_button`';
    link: 'A dashboard link, such as `invoice_link`';
    tab: 'A dashboard tab';
    modal: 'A dashboard modal';
    page: 'A dashboard page, such as `create_page`';
}

export interface AnalyticsActions {
    click: 'A UI element was clicked';
    submit: 'A form or request was sent';
    create: 'Something new now exists. Sent by the server when the attempt finishes, it carries `is_success`, so failed attempts count too';
    view: 'A page or item was seen';
    add: 'Something was added to an existing thing';
    invite: 'Someone was invited';
    update: 'Something changed';
    delete: 'Something was destroyed';
    remove: 'Something was taken out of an existing thing, not destroyed';
    start: 'Something with a lifetime began, such as a session. Pairs with `end`';
    end: 'Something with a lifetime stopped. Pairs with `start`';
    complete: 'An operation that produces no new thing finished, such as a run or a tool call. Always carries `is_success`';
    cancel: 'Someone stopped a process';
    generate: 'Something was produced automatically';
    send: 'Something was sent to someone';
}

export type AnalyticsCategory = keyof AnalyticsCategories;
export type AnalyticsObject = keyof AnalyticsObjects | `${string}_${keyof AnalyticsUiElements}`;
export type AnalyticsAction = keyof AnalyticsActions;

export type AnalyticsEventName = `${AnalyticsCategory}:${AnalyticsObject}_${AnalyticsAction}`;
