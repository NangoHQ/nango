export interface Test {
    id: string;
}
type LogLevel = 'info' | 'debug' | 'error' | 'warn' | 'http' | 'verbose' | 'silly';
interface ParamEncoder {
    (value: any, defaultEncoder: (value: any) => any): any;
}
interface GenericFormData {
    append(name: string, value: any, options?: any): any;
}
interface SerializerVisitor {
    (this: GenericFormData, value: any, key: string | number, path: null | Array<string | number>, helpers: FormDataVisitorHelpers): boolean;
}
interface CustomParamsSerializer {
    (params: Record<string, any>, options?: ParamsSerializerOptions): string;
}
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
interface AxiosResponse<T = any, D = any> {
    data: T;
    status: number;
    statusText: string;
    headers: any;
    config: D;
    request?: any;
}
interface ProxyConfiguration {
    endpoint: string;
    providerConfigKey?: string;
    connectionId?: string;
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'get' | 'post' | 'patch' | 'put' | 'delete';
    headers?: Record<string, string>;
    params?: string | Record<string, string>;
    paramsSerializer?: ParamsSerializerOptions;
    data?: unknown;
    retries?: number;
    baseUrlOverride?: string;
}
declare enum AuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2',
    Basic = 'BASIC',
    ApiKey = 'API_KEY'
}
interface BasicApiCredentials {
    type?: AuthModes.Basic;
    username: string;
    password: string;
}
interface ApiKeyCredentials {
    type?: AuthModes.ApiKey;
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
type AuthCredentials = OAuth2Credentials | OAuth1Credentials | BasicApiCredentials | ApiKeyCredentials;
interface Metadata {
    [key: string]: string | Record<string, string>;
}
interface Connection {
    id?: number;
    created_at?: string;
    updated_at?: string;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    environment_id: number;
    metadata: Metadata | null;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    credentials: AuthCredentials;
}
interface NangoProps {
    host?: string;
    secretKey: string;
    connectionId?: string;
    environmentId?: number;
    activityLogId?: number;
    providerConfigKey?: string;
    lastSyncDate?: Date;
    syncId?: string | undefined;
    nangoConnectionId?: number;
    syncJobId?: number | undefined;
    dryRun?: boolean;
    track_deletes?: boolean;
}
interface UserLogParameters {
    level?: LogLevel;
}
export declare class NangoSync {
    private nango;
    activityLogId?: number;
    lastSyncDate?: Date;
    syncId?: string;
    nangoConnectionId?: number;
    environmentId?: number;
    syncJobId?: number;
    dryRun?: boolean;
    track_deletes: boolean;
    connectionId?: string;
    providerConfigKey?: string;
    constructor(config: NangoProps);
    /**
     * Set Sync Last Sync Date
     * @desc permanently set the last sync date for the sync
     * to be used for the next sync run
     */
    setLastSyncDate(date: Date): Promise<boolean>;
    proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;
    get<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;
    post<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;
    patch<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;
    delete<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;
    getConnection(): Promise<Connection>;
    setMetadata(metadata: Record<string, string>): Promise<AxiosResponse<void>>;
    setFieldMapping(fieldMapping: Record<string, string>): Promise<AxiosResponse<void>>;
    getMetadata<T = Metadata>(): Promise<T>;
    getFieldMapping(): Promise<Metadata>;
    batchSend<T = any>(results: T[], model: string): Promise<boolean | null>;
    batchSave<T = any>(results: T[], model: string): Promise<boolean | null>;
    batchDelete<T = any>(results: T[], model: string): Promise<boolean | null>;
    log(content: string, userDefinedLevel?: UserLogParameters): Promise<void>;
}
export {};
