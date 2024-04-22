export interface Contact {
    id: string;
}

export interface Issue {
    id: string;
}
type ParamEncoder = (value: any, defaultEncoder: (value: any) => any) => any;
interface GenericFormData {
    append(name: string, value: any, options?: any): any;
}
type SerializerVisitor = (
    this: GenericFormData,
    value: any,
    key: string | number,
    path: null | (string | number)[],
    helpers: FormDataVisitorHelpers
) => boolean;
type CustomParamsSerializer = (params: Record<string, any>, options?: ParamsSerializerOptions) => string;
interface FormDataVisitorHelpers {
    defaultVisitor: SerializerVisitor;
    convertValue: (value: any) => any;
    isVisitable: (value: any) => boolean;
}
interface SerializerOptions {
    visitor?: SerializerVisitor;
    dots?: boolean;
    metaTokens?: boolean;
    indexes?: boolean | null;
}
interface ParamsSerializerOptions extends SerializerOptions {
    encode?: ParamEncoder;
    serialize?: CustomParamsSerializer;
}
export interface AxiosResponse<T = any, D = any> {
    data: T;
    status: number;
    statusText: string;
    headers: any;
    config: D;
    request?: any;
}
interface Pagination {
    type: string;
    limit?: number;
    response_path?: string;
    limit_name_in_request: string;
}
interface CursorPagination extends Pagination {
    cursor_path_in_response: string;
    cursor_name_in_request: string;
}
interface LinkPagination extends Pagination {
    link_rel_in_response_header?: string;
    link_path_in_response_body?: string;
}
interface OffsetPagination extends Pagination {
    offset_name_in_request: string;
}
interface RetryHeaderConfig {
    at?: string;
    after?: string;
}
export interface ProxyConfiguration {
    endpoint: string;
    providerConfigKey?: string;
    connectionId?: string;
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'get' | 'post' | 'patch' | 'put' | 'delete';
    headers?: Record<string, string>;
    params?: string | Record<string, string | number>;
    paramsSerializer?: ParamsSerializerOptions;
    data?: unknown;
    retries?: number;
    baseUrlOverride?: string;
    paginate?: Partial<CursorPagination> | Partial<LinkPagination> | Partial<OffsetPagination>;
    retryHeader?: RetryHeaderConfig;
    responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
    retryOn?: number[] | null;
}
declare enum AuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2',
    OAuth2CC = 'OAUTH2_CC',
    Basic = 'BASIC',
    ApiKey = 'API_KEY',
    AppStore = 'APP_STORE',
    App = 'APP',
    Custom = 'CUSTOM',
    None = 'NONE'
}
interface OAuth1Token {
    oAuthToken: string;
    oAuthTokenSecret: string;
}
interface AppCredentials {
    type: AuthModes.App;
    access_token: string;
    expires_at?: Date | undefined;
    raw: Record<string, any>;
}
interface AppStoreCredentials {
    type?: AuthModes.AppStore;
    access_token: string;
    expires_at?: Date | undefined;
    raw: Record<string, any>;
    private_key: string;
}
interface BasicApiCredentials {
    type: AuthModes.Basic;
    username: string;
    password: string;
}
interface ApiKeyCredentials {
    type: AuthModes.ApiKey;
    apiKey: string;
}
interface CredentialsCommon<T = Record<string, any>> {
    type: AuthModes;
    raw: T;
}
interface OAuth2Credentials extends CredentialsCommon {
    type: AuthModes.OAuth2;
    access_token: string;
    refresh_token?: string;
    expires_at?: Date | undefined;
}
interface OAuth1Credentials extends CredentialsCommon {
    type: AuthModes.OAuth1;
    oauth_token: string;
    oauth_token_secret: string;
}
type UnauthCredentials = Record<string, never>;
type AuthCredentials =
    | OAuth2Credentials
    | OAuth1Credentials
    | BasicApiCredentials
    | ApiKeyCredentials
    | AppCredentials
    | AppStoreCredentials
    | UnauthCredentials;
type Metadata = Record<string, string | Record<string, any>>;
interface Connection {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    environment_id: number;
    metadata?: Metadata | null;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    credentials: AuthCredentials;
}
export declare class ActionError<T = Record<string, unknown>> extends Error {
    type: string;
    payload?: Record<string, unknown>;
    constructor(payload?: T);
}
export interface NangoProps {
    host?: string;
    secretKey: string;
    accountId?: number;
    connectionId: string;
    environmentId?: number;
    activityLogId?: number;
    providerConfigKey: string;
    provider?: string;
    lastSyncDate?: Date;
    syncId?: string | undefined;
    nangoConnectionId?: number;
    syncJobId?: number | undefined;
    dryRun?: boolean;
    track_deletes?: boolean;
    attributes?: object | undefined;
    logMessages?:
        | {
              counts: {
                  updated: number;
                  added: number;
                  deleted: number;
              };
              messages: unknown[];
          }
        | undefined;
    stubbedMetadata?: Metadata | undefined;
    abortSignal?: AbortSignal;
}
interface EnvironmentVariable {
    name: string;
    value: string;
}
export declare class NangoAction {
    private nango;
    private attributes;
    activityLogId?: number;
    syncId?: string;
    nangoConnectionId?: number;
    environmentId?: number;
    syncJobId?: number;
    dryRun?: boolean;
    abortSignal?: AbortSignal;
    connectionId: string;
    providerConfigKey: string;
    provider?: string;
    ActionError: typeof ActionError;
    private memoizedConnections;
    constructor(config: NangoProps);
    protected stringify(): string;
    private proxyConfig;
    protected exitSyncIfAborted(): void;
    proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;
    get<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;
    post<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;
    put<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;
    patch<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;
    delete<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;
    getToken(): Promise<string | OAuth1Token | BasicApiCredentials | ApiKeyCredentials | AppCredentials | AppStoreCredentials>;
    getConnection(providerConfigKeyOverride?: string, connectionIdOverride?: string): Promise<Connection>;
    setMetadata(metadata: Record<string, any>): Promise<AxiosResponse<void>>;
    updateMetadata(metadata: Record<string, any>): Promise<AxiosResponse<void>>;
    setFieldMapping(fieldMapping: Record<string, string>): Promise<AxiosResponse<void>>;
    getMetadata<T = Metadata>(): Promise<T>;
    getWebhookURL(): Promise<string | undefined>;
    getFieldMapping(): Promise<Metadata>;
    /**
     * Log
     * @desc Log a message to the activity log which shows up in the Nango Dashboard
     * note that the last argument can be an object with a level property to specify the log level
     * example: await nango.log('This is a log message', { level: 'error' })
     * error = red
     * warn = orange
     * info = white
     * debug = grey
     * http = green
     * silly = light green
     */
    log(...args: any[]): Promise<void>;
    getEnvironmentVariables(): Promise<EnvironmentVariable[] | null>;
    getFlowAttributes<A = object>(): A | null;
    paginate<T = any>(config: ProxyConfiguration): AsyncGenerator<T[], undefined, void>;
    triggerAction<T = object>(providerConfigKey: string, connectionId: string, actionName: string, input?: unknown): Promise<T>;
    triggerSync(providerConfigKey: string, connectionId: string, syncName: string, fullResync?: boolean): Promise<void>;
}
export declare class NangoSync extends NangoAction {
    lastSyncDate?: Date;
    track_deletes: boolean;
    logMessages?:
        | {
              counts: {
                  updated: number;
                  added: number;
                  deleted: number;
              };
              messages: unknown[];
          }
        | undefined;
    stubbedMetadata?: Metadata | undefined;
    private batchSize;
    constructor(config: NangoProps);
    /**
     * Deprecated, reach out to support
     */
    setLastSyncDate(): Promise<void>;
    /**
     * Deprecated, please use batchSave
     */
    batchSend<T = any>(results: T[], model: string): Promise<boolean | null>;
    batchSave<T = any>(results: T[], model: string): Promise<boolean | null>;
    batchDelete<T = any>(results: T[], model: string): Promise<boolean | null>;
    batchUpdate<T = any>(results: T[], model: string): Promise<boolean | null>;
    getMetadata<T = Metadata>(): Promise<T>;
}
/**
 * This function will enable tracing on the SDK
 * It has been split from the actual code to avoid making the code too dirty and to easily enable/disable tracing if there is an issue with it
 */
export declare function instrumentSDK(rawNango: NangoAction | NangoSync): NangoAction | NangoSync;
export {};
export const NangoFlows = [
    {
        providerConfigKey: 'hubspot',
        syncs: [
            {
                name: 'contacts',
                type: 'sync',
                models: [
                    {
                        name: 'Contact',
                        fields: [
                            {
                                name: 'id',
                                type: 'string'
                            }
                        ]
                    }
                ],
                sync_type: 'INCREMENTAL',
                runs: 'every day',
                track_deletes: false,
                auto_start: true,
                last_deployed: null,
                is_public: false,
                pre_built: false,
                version: null,
                attributes: {},
                input: {},
                returns: ['Contact'],
                description: '',
                scopes: [],
                endpoints: [
                    {
                        GET: '/hubspot/contacts'
                    }
                ],
                nango_yaml_version: 'v2',
                webhookSubscriptions: [],
                enabled: true,
                layout_mode: 'root'
            }
        ],
        actions: [
            {
                name: 'create-contact',
                type: 'action',
                models: [],
                runs: '',
                is_public: false,
                pre_built: false,
                version: null,
                last_deployed: null,
                attributes: {},
                description: '',
                scopes: [],
                input: {},
                endpoints: [
                    {
                        POST: '/hubspot/contact'
                    }
                ],
                nango_yaml_version: 'v2',
                enabled: true,
                layout_mode: 'root'
            }
        ],
        postConnectionScripts: []
    },
    {
        providerConfigKey: 'github',
        syncs: [
            {
                name: 'issues',
                type: 'sync',
                models: [
                    {
                        name: 'Issue',
                        fields: [
                            {
                                name: 'id',
                                type: 'string'
                            }
                        ]
                    }
                ],
                sync_type: 'INCREMENTAL',
                runs: 'every day',
                track_deletes: false,
                auto_start: true,
                last_deployed: null,
                is_public: false,
                pre_built: false,
                version: null,
                attributes: {},
                input: {},
                returns: ['Issue'],
                description: '',
                scopes: [],
                endpoints: [
                    {
                        GET: '/github/issues'
                    }
                ],
                nango_yaml_version: 'v2',
                webhookSubscriptions: [],
                enabled: true,
                layout_mode: 'root'
            }
        ],
        actions: [
            {
                name: 'create-issue',
                type: 'action',
                models: [],
                runs: '',
                is_public: false,
                pre_built: false,
                version: null,
                last_deployed: null,
                attributes: {},
                description: '',
                scopes: [],
                input: {},
                endpoints: [
                    {
                        POST: '/github/issue'
                    }
                ],
                nango_yaml_version: 'v2',
                enabled: true,
                layout_mode: 'root'
            }
        ],
        postConnectionScripts: []
    }
] as const;
