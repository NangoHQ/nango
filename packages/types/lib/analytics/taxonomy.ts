export type AnalyticsSurface = 'web' | 'cli' | 'server';

export type AnalyticsCategory =
    | 'auth'
    /** Who did what in the account. Function logs are not `audit`. */
    | 'audit'
    /** Getting Started */
    | 'onboarding'
    | 'connections'
    | 'playground'
    /** Syncs and actions, including CLI commands */
    | 'functions'
    /** Plans, usage and payment */
    | 'billing'
    | 'agents';

type AnalyticsUiElement = 'button' | 'link' | 'tab' | 'modal' | 'page';

export type AnalyticsObject =
    | 'account'
    | 'user'
    | 'connection'
    /** A provider configured in an environment. Never `provider`. */
    | 'integration'
    | 'deploy'
    /** A CLI command, such as `compile` or `deploy` */
    | 'command'
    /** A sync or an action */
    | 'function'
    | 'run'
    | 'api_key'
    | 'environment'
    | 'plan'
    | 'session'
    | 'tool_call'
    | 'proxy_request'
    | 'tool_search'
    /** The Usage page's metrics and charts */
    | 'usage'
    | 'playground'
    | 'two_factor'
    | 'recovery_codes'
    | 'password'
    | 'join_request'
    | 'export'
    /** A dashboard element, such as `create_button` or `create_page` */
    | `${string}_${AnalyticsUiElement}`;

export type AnalyticsAction =
    | 'click'
    | 'submit'
    /** The server sends it when the attempt finishes, with `is_success`, so failures count too. */
    | 'create'
    | 'view'
    /** Added to an existing thing. Pairs with `remove`. */
    | 'add'
    | 'invite'
    | 'update'
    /** Destroyed. Taking something out of an existing thing is `remove`. */
    | 'delete'
    | 'remove'
    | 'start'
    | 'end'
    /** An operation that produced no new thing finished. Always carries `is_success`. */
    | 'complete'
    | 'cancel'
    | 'generate'
    | 'send';

export type AnalyticsEventName = `${AnalyticsCategory}:${AnalyticsObject}_${AnalyticsAction}`;

/** The naming check skips these. NAN-7185 replaces `web:account_signup` and empties this. */
export type LegacyAnalyticsEventName = 'web:account_signup';
