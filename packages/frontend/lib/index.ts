/*
 * Copyright (c) 2024 Nango, all rights reserved.
 */
import type { PostPublicUnauthenticatedAuthorization } from '@nangohq/types';
import type { ConnectUIProps } from './connectUI';
import { ConnectUI } from './connectUI.js';
import type {
    ConnectionConfig,
    ApiKeyCredentials,
    AppStoreCredentials,
    AuthErrorType,
    AuthOptions,
    AuthResult,
    BasicApiCredentials,
    ErrorHandler,
    OAuth2ClientCredentials,
    TBACredentials,
    TableauCredentials,
    TwoStepCredentials,
    JwtCredentials,
    OAuthCredentialsOverride,
    BillCredentials,
    SignatureCredentials
} from './types';
import { AuthorizationStatus, WSMessageType } from './types.js';

export type * from './types';
export * from './connectUI.js';

const prodHost = 'https://api.nango.dev';
const debugLogPrefix = 'NANGO DEBUG LOG: ';

export type NangoOptions = {
    host?: string;
    websocketsPath?: string;
    width?: number;
    height?: number;
    debug?: boolean;
} & (
    | {
          connectSessionToken?: string;
          publicKey?: never;
      }
    | {
          connectSessionToken?: never;
          publicKey?: string;
      }
);

export class AuthError extends Error {
    type;

    constructor(message: string, type: AuthErrorType) {
        super(message);
        this.type = type;
    }
}

export default class Nango {
    private hostBaseUrl: string;
    private websocketsBaseUrl: string;
    private status: AuthorizationStatus;
    private publicKey: string | undefined;
    private connectSessionToken: string | undefined;
    private debug = false;
    private width: number | null = null;
    private height: number | null = null;
    private tm: null | NodeJS.Timer = null;

    public win: AuthorizationModal | null = null;

    constructor(config: NangoOptions = {}) {
        config.host = config.host || prodHost; // Default to Nango Cloud.
        config.websocketsPath = config.websocketsPath || '/'; // Default to root path.
        this.debug = config.debug || false;

        if (this.debug) {
            console.log(debugLogPrefix, `Debug mode is enabled.`);
            console.log(debugLogPrefix, `Using host: ${config.host}.`);
        }

        if (config.width) {
            this.width = config.width;
        }

        if (config.height) {
            this.height = config.height;
        }

        this.hostBaseUrl = config.host.replace(/\/+$/, ''); // Remove trailing slash.
        this.status = AuthorizationStatus.IDLE;

        this.publicKey = config.publicKey;
        this.connectSessionToken = config.connectSessionToken;

        try {
            const baseUrl = new URL(this.hostBaseUrl);
            // Build the websockets url based on the host url.
            // The websockets path is considered relative to the baseUrl, and with the protocol updated
            const websocketUrl = new URL(config.websocketsPath, baseUrl);
            this.websocketsBaseUrl = websocketUrl.toString().replace('https://', 'wss://').replace('http://', 'ws://');
        } catch {
            throw new AuthError('Invalid URL provided for the Nango host.', 'invalidHostUrl');
        }
    }

    /**
     * Creates a new unauthenticated connection using the specified provider configuration key and connection ID
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param connectionId -  Optional. The ID of the connection
     * @param connectionConfig - Optional. Additional configuration for the connection
     * @returns A promise that resolves with the authentication result
     */
    public async create(providerConfigKey: string, connectionConfig?: ConnectionConfig): Promise<AuthResult>;
    public async create(providerConfigKey: string, connectionId: string, connectionConfig?: ConnectionConfig): Promise<AuthResult>;
    public async create(
        providerConfigKey: string,
        connectionIdOrConnectionConfig?: string | ConnectionConfig,
        moreConnectionConfig?: ConnectionConfig
    ): Promise<AuthResult> {
        this.ensureCredentials();

        let connectionId: string | null = null;
        let connectionConfig: ConnectionConfig | undefined = moreConnectionConfig;
        if (typeof connectionIdOrConnectionConfig === 'string') {
            connectionId = connectionIdOrConnectionConfig;
        } else {
            connectionConfig = connectionIdOrConnectionConfig;
        }
        const url = this.hostBaseUrl + `/auth/unauthenticated/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig)}`;

        const res = await this.triggerAuth({
            authUrl: url
        });

        return res as PostPublicUnauthenticatedAuthorization['Success'];
    }

    /**
     * Initiates the authorization process for a connection
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param connectionId - Optional. The ID of the connection for which to authorize
     * @param options - Optional. Additional options for authorization
     * @returns A promise that resolves with the authorization result
     */
    public auth(providerConfigKey: string, options?: AuthOptions): Promise<AuthResult>;
    public auth(providerConfigKey: string, connectionId: string, options?: AuthOptions): Promise<AuthResult>;
    public auth(providerConfigKey: string, connectionIdOrOptions?: string | AuthOptions, moreOptions?: AuthOptions): Promise<AuthResult> {
        this.ensureCredentials();

        let connectionId: string | null = null;
        let options: AuthOptions | undefined = moreOptions;
        if (typeof connectionIdOrOptions === 'string') {
            connectionId = connectionIdOrOptions;
        } else {
            options = {
                ...options,
                ...connectionIdOrOptions
            };
        }
        if (
            options &&
            'credentials' in options &&
            (('token_id' in options.credentials && 'token_secret' in options.credentials) ||
                !('oauth_client_id_override' in options.credentials) ||
                !('oauth_client_secret_override' in options.credentials)) &&
            Object.keys(options.credentials).length > 0
        ) {
            const credentials = options.credentials;
            const { credentials: _, ...connectionConfig } = options as ConnectionConfig;

            return this.customAuth(providerConfigKey, connectionId, this.convertCredentialsToConfig(credentials), connectionConfig);
        }

        const url = this.hostBaseUrl + `/oauth/connect/${providerConfigKey}${this.toQueryString(connectionId, options as ConnectionConfig)}`;

        try {
            new URL(url);
        } catch {
            throw new AuthError('Invalid URL provided for the Nango host.', 'invalidHostUrl');
        }

        return new Promise<AuthResult>((resolve, reject) => {
            // Clear state if the modal is closed
            if (this.win?.modal?.closed) {
                this.clear();
            }

            const successHandler = (providerConfigKey: string, connectionId: string, isPending = false) => {
                if (this.status !== AuthorizationStatus.BUSY) {
                    return;
                }

                this.status = AuthorizationStatus.DONE;

                resolve({
                    providerConfigKey: providerConfigKey,
                    connectionId: connectionId,
                    isPending
                });
                return;
            };

            const errorHandler: ErrorHandler = (errorType, errorDesc) => {
                if (this.status !== AuthorizationStatus.BUSY) {
                    return;
                }

                this.status = AuthorizationStatus.DONE;

                const error = new AuthError(errorDesc, errorType);
                reject(error);
                return;
            };

            if (this.status === AuthorizationStatus.BUSY) {
                const error = new AuthError('The authorization window is already opened', 'windowIsOpened');
                reject(error);
                return;
            }

            // Save authorization status (for handler)
            this.status = AuthorizationStatus.BUSY;

            // Open authorization modal
            this.win = new AuthorizationModal(
                this.websocketsBaseUrl,
                url,
                successHandler,
                errorHandler,
                { width: this.width, height: this.height },
                this.debug
            );

            if (options?.detectClosedAuthWindow) {
                this.tm = setInterval(() => {
                    if (!this.win || !this.win.modal) {
                        return;
                    }

                    if (this.win.modal.window && !this.win.modal.window.closed) {
                        return;
                    }

                    if (this.win.isProcessingMessage) {
                        // Modal is still processing a web socket message from the server
                        // We ignore the window being closed for now
                        return;
                    }

                    clearInterval(this.tm as unknown as number);
                    this.win = null;
                    this.status = AuthorizationStatus.CANCELED;
                    const error = new AuthError('The authorization window was closed before the authorization flow was completed', 'windowClosed');
                    reject(error);
                }, 500);
            }
        });
    }

    public reconnect(providerConfigKey: string, options?: AuthOptions): Promise<AuthResult> {
        if (!this.connectSessionToken) {
            throw new AuthError('Reconnect requires a session token', 'missing_connect_session_token');
        }

        return this.auth(providerConfigKey, options);
    }

    /**
     * Clear state of the frontend SDK
     */
    public clear() {
        if (this.tm) {
            clearInterval(this.tm as unknown as number);
        }

        if (this.win) {
            try {
                this.win.close();
            } catch {
                // do nothing
            }
            this.win = null;
        }

        this.status = AuthorizationStatus.IDLE;
    }

    /**
     * Open managed Connect UI
     */
    public openConnectUI(params: ConnectUIProps) {
        const connect = new ConnectUI({ sessionToken: this.connectSessionToken, ...params });
        connect.open();
        return connect;
    }

    /**
     * Converts the provided credentials to a Connection configuration object
     * @param credentials - The credentials to convert
     * @returns The connection configuration object
     */
    private convertCredentialsToConfig(
        credentials:
            | OAuthCredentialsOverride
            | BasicApiCredentials
            | ApiKeyCredentials
            | AppStoreCredentials
            | TBACredentials
            | TableauCredentials
            | JwtCredentials
            | OAuth2ClientCredentials
            | BillCredentials
            | TwoStepCredentials
            | SignatureCredentials
    ): ConnectionConfig {
        const params: Record<string, string> = {};

        if ('type' in credentials && 'username' in credentials && 'password' in credentials && credentials.type === 'SIGNATURE') {
            const signatureCredentials: SignatureCredentials = {
                type: credentials.type,
                username: credentials.username,
                password: credentials.password
            };

            return { params: signatureCredentials } as unknown as ConnectionConfig;
        }

        if ('username' in credentials) {
            params['username'] = credentials.username || '';
        }
        if ('password' in credentials) {
            params['password'] = credentials.password || '';
        }
        if ('apiKey' in credentials) {
            params['apiKey'] = credentials.apiKey || '';
        }

        if ('privateKeyId' in credentials || 'issuerId' in credentials || 'privateKey' in credentials) {
            const jwtParams: Record<string, string | { id: string; secret: string }> = {};
            if (credentials.privateKeyId) {
                jwtParams['privateKeyId'] = credentials.privateKeyId;
            }
            if (credentials.issuerId) {
                jwtParams['issuerId'] = credentials.issuerId;
            }
            if (credentials.privateKey) {
                if (typeof credentials.privateKey === 'string') {
                    jwtParams['privateKey'] = credentials.privateKey;
                } else if (typeof credentials.privateKey === 'object' && 'id' in credentials.privateKey && 'secret' in credentials.privateKey) {
                    jwtParams['privateKey'] = credentials.privateKey;
                }
            }
            return { params: jwtParams } as unknown as ConnectionConfig;
        }

        if ('privateKeyId' in credentials && 'issuerId' in credentials && 'privateKey' in credentials) {
            const appStoreCredentials: { params: Record<string, string | string[]> } = {
                params: {
                    privateKeyId: credentials.privateKeyId as string,
                    issuerId: credentials.issuerId as string,
                    privateKey: credentials.privateKey as string
                }
            };

            if ('scope' in credentials && (typeof credentials.scope === 'string' || Array.isArray(credentials.scope))) {
                appStoreCredentials.params['scope'] = credentials.scope;
            }
            return appStoreCredentials as unknown as ConnectionConfig;
        }

        if ('client_id' in credentials && 'client_secret' in credentials) {
            const oauth2CCCredentials: OAuth2ClientCredentials = {
                client_id: credentials.client_id,
                client_secret: credentials.client_secret
            };

            return { params: oauth2CCCredentials } as unknown as ConnectionConfig;
        }

        if ('token_id' in credentials && 'token_secret' in credentials) {
            const tbaCredentials: TBACredentials = {
                token_id: credentials.token_id,
                token_secret: credentials.token_secret
            };

            if ('oauth_client_id_override' in credentials) {
                tbaCredentials['oauth_client_id_override'] = credentials.oauth_client_id_override;
            }

            if ('oauth_client_secret_override' in credentials) {
                tbaCredentials['oauth_client_secret_override'] = credentials.oauth_client_secret_override;
            }

            return { params: tbaCredentials } as unknown as ConnectionConfig;
        }

        if ('pat_name' in credentials && 'pat_secret' in credentials) {
            const tableauCredentials: TableauCredentials = {
                pat_name: credentials.pat_name,
                pat_secret: credentials.pat_secret
            };

            if ('content_url' in credentials) {
                tableauCredentials['content_url'] = credentials.content_url;
            }

            return { params: tableauCredentials } as unknown as ConnectionConfig;
        }

        if ('username' in credentials && 'password' in credentials && 'organization_id' in credentials && 'dev_key' in credentials) {
            const BillCredentials: BillCredentials = {
                username: credentials.username,
                password: credentials.password,
                organization_id: credentials.organization_id as string,
                dev_key: credentials.dev_key as string
            };

            return { params: BillCredentials } as unknown as ConnectionConfig;
        }

        if ('type' in credentials && credentials.type === 'TWO_STEP') {
            const twoStepCredentials: Record<string, any> = { ...credentials };

            return { params: twoStepCredentials } as unknown as ConnectionConfig;
        }

        return { params };
    }

    private async triggerAuth({
        authUrl,
        credentials
    }: {
        authUrl: string;
        credentials?:
            | ApiKeyCredentials
            | BasicApiCredentials
            | AppStoreCredentials
            | TBACredentials
            | TableauCredentials
            | JwtCredentials
            | BillCredentials
            | OAuth2ClientCredentials
            | TwoStepCredentials
            | SignatureCredentials
            | undefined;
    }): Promise<AuthResult> {
        const res = await fetch(authUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            ...(credentials ? { body: JSON.stringify(credentials) } : {})
        });

        if (!res.ok) {
            const errorResponse = await res.json();
            throw new AuthError(errorResponse.error.message, errorResponse.error.code);
        }

        return res.json();
    }

    /**
     * Performs authorization based on the provided credentials i.e api, basic, appstore and oauth2
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param connectionId - The ID of the connection for which to create the custom Authorization
     * @param connectionConfigWithCredentials - The connection configuration containing the credentials
     * @param connectionConfig - Optional. Additional connection configuration
     * @returns A promise that resolves with the authorization result
     */
    private async customAuth(
        providerConfigKey: string,
        connectionId: string | null,
        connectionConfigWithCredentials: ConnectionConfig,
        connectionConfig?: ConnectionConfig
    ): Promise<AuthResult> {
        const { params: credentials } = connectionConfigWithCredentials;

        if (!credentials) {
            throw new AuthError('You must specify credentials.', 'missingCredentials');
        }

        if ('type' in credentials && credentials['type'] === 'TWO_STEP') {
            return await this.triggerAuth({
                authUrl: this.hostBaseUrl + `/auth/two-step/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`,
                credentials: credentials as unknown as TwoStepCredentials
            });
        }

        if ('type' in credentials && credentials['type'] === 'SIGNATURE' && 'username' in credentials && 'password' in credentials) {
            return await this.triggerAuth({
                authUrl: this.hostBaseUrl + `/auth/signature/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`,
                credentials: credentials as unknown as SignatureCredentials
            });
        }

        if ('username' in credentials && 'password' in credentials && 'organization_id' in credentials && 'dev_key' in credentials) {
            return await this.triggerAuth({
                authUrl: this.hostBaseUrl + `/auth/bill/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`,
                credentials: credentials as unknown as BillCredentials
            });
        }

        if ('apiKey' in credentials) {
            return await this.triggerAuth({
                authUrl: this.hostBaseUrl + `/api-auth/api-key/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`,
                credentials: credentials as ApiKeyCredentials
            });
        }

        if ('username' in credentials || 'password' in credentials) {
            return await this.triggerAuth({
                authUrl: this.hostBaseUrl + `/api-auth/basic/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`,
                credentials: credentials as BasicApiCredentials
            });
        }

        if ('privateKeyId' in credentials || 'issuerId' in credentials || 'privateKey' in credentials) {
            return await this.triggerAuth({
                authUrl: this.hostBaseUrl + `/auth/jwt/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`,
                credentials: credentials as unknown as JwtCredentials
            });
        }

        if ('privateKeyId' in credentials && 'issuerId' in credentials && 'privateKey' in credentials) {
            return await this.triggerAuth({
                authUrl: this.hostBaseUrl + `/app-store-auth/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`,
                credentials: credentials as unknown as AppStoreCredentials
            });
        }

        if ('token_id' in credentials && 'token_secret' in credentials) {
            return await this.triggerAuth({
                authUrl: this.hostBaseUrl + `/auth/tba/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`,
                credentials: credentials as unknown as TBACredentials
            });
        }

        if ('pat_name' in credentials && 'pat_secret' in credentials) {
            return await this.triggerAuth({
                authUrl: this.hostBaseUrl + `/auth/tableau/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`,
                credentials: credentials as unknown as TableauCredentials
            });
        }

        if ('client_id' in credentials && 'client_secret' in credentials) {
            return await this.triggerAuth({
                authUrl: this.hostBaseUrl + `/oauth2/auth/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`,
                credentials: credentials as unknown as OAuth2ClientCredentials
            });
        }

        return Promise.reject(new Error('Something went wrong with the authorization'));
    }

    /**
     * Converts the connection ID and configuration parameters into a query string
     * @param connectionId - The ID of the connection for which to generate a query string
     * @param connectionConfig - Optional. Additional configuration for the connection
     * @returns The generated query string
     */
    private toQueryString(connectionId: string | null, connectionConfig?: ConnectionConfig): string {
        const query: string[] = [];

        if (connectionId) {
            query.push(`connection_id=${connectionId}`);
        }

        if (this.publicKey) {
            query.push(`public_key=${this.publicKey}`);
        }

        if (this.connectSessionToken) {
            query.push(`connect_session_token=${this.connectSessionToken}`);
        }

        if (connectionConfig) {
            for (const param in connectionConfig.params) {
                const val = connectionConfig.params[param];
                if (typeof val === 'string') {
                    query.push(`params[${param}]=${val}`);
                }
            }

            if (connectionConfig.hmac) {
                query.push(`hmac=${connectionConfig.hmac}`);
            }

            if (connectionConfig.user_scope) {
                query.push(`user_scope=${connectionConfig.user_scope.join(',')}`);
            }

            if (connectionConfig.credentials) {
                const credentials = connectionConfig.credentials;
                if ('oauth_client_id_override' in credentials) {
                    query.push(`credentials[oauth_client_id_override]=${encodeURIComponent(credentials.oauth_client_id_override)}`);
                }
                if ('oauth_client_secret_override' in credentials) {
                    query.push(`credentials[oauth_client_secret_override]=${encodeURIComponent(credentials.oauth_client_secret_override)}`);
                }

                if ('token_id' in credentials) {
                    query.push(`token_id=${encodeURIComponent(credentials.token_id)}`);
                }

                if ('token_secret' in credentials) {
                    query.push(`token_secret=${encodeURIComponent(credentials.token_secret)}`);
                }
            }

            for (const param in connectionConfig.authorization_params) {
                const val = connectionConfig.authorization_params[param];
                if (typeof val === 'string') {
                    query.push(`authorization_params[${param}]=${val}`);
                } else if (val === undefined) {
                    query.push(`authorization_params[${param}]=undefined`);
                }
            }
        }

        return query.length === 0 ? '' : '?' + query.join('&');
    }

    /**
     * Check that we have one valid credential
     * It's not done in the constructor because if you only use Nango Connect it's not relevant to throw an error
     */
    private ensureCredentials() {
        if (!this.publicKey && !this.connectSessionToken) {
            throw new AuthError('You must specify a public key OR a connect session token (cf. documentation).', 'missingAuthToken');
        }
    }
}

/**
 * AuthorizationModal class
 */
class AuthorizationModal {
    private url: string;
    private features: Record<string, string | number>;
    private width = 500;
    private height = 600;
    private swClient: WebSocket;
    private debug: boolean;
    private wsClientId: string | undefined;
    private errorHandler: ErrorHandler;
    public modal: Window | undefined;
    public isProcessingMessage = false;

    constructor(
        webSocketUrl: string,
        url: string,
        successHandler: (providerConfigKey: string, connectionId: string) => any,
        errorHandler: ErrorHandler,
        { width, height }: { width?: number | null; height?: number | null },
        debug?: boolean
    ) {
        // Window modal URL
        this.url = url;
        this.debug = debug || false;

        const { left, top, computedWidth, computedHeight } = this.layout(width || this.width, height || this.height);

        // Window modal features
        this.features = {
            width: computedWidth,
            height: computedHeight,
            top,
            left,
            scrollbars: 'yes',
            resizable: 'yes',
            status: 'no',
            toolbar: 'no',
            location: 'no',
            copyhistory: 'no',
            menubar: 'no',
            directories: 'no'
        };

        this.swClient = new WebSocket(webSocketUrl);
        this.errorHandler = errorHandler;

        this.swClient.onmessage = (message: MessageEvent) => {
            this.isProcessingMessage = true;
            this.handleMessage(message, successHandler);
            this.isProcessingMessage = false;
        };
    }

    /**
     * Handles the messages received from the Nango server via WebSocket
     * @param message - The message event containing data from the server
     * @param successHandler - The success handler function to be called when a success message is received
     */
    handleMessage(message: MessageEvent, successHandler: (providerConfigKey: string, connectionId: string) => any) {
        const data = JSON.parse(message.data);

        switch (data.message_type) {
            case WSMessageType.ConnectionAck: {
                if (this.debug) {
                    console.log(debugLogPrefix, 'Connection ack received. Opening modal...');
                }

                this.wsClientId = data.ws_client_id;
                this.open();
                break;
            }
            case WSMessageType.Error:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Error received. Rejecting authorization...');
                }

                this.errorHandler(data.error_type, data.error_desc);
                this.swClient.close();
                break;
            case WSMessageType.Success:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Success received. Resolving authorization...');
                }

                successHandler(data.provider_config_key, data.connection_id);
                this.swClient.close();
                break;
            default:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Unknown message type received from Nango server. Ignoring...');
                }
                return;
        }
    }

    /**
     * Calculates the layout dimensions for a modal window based on the expected width and height
     * @param expectedWidth - The expected width of the modal window
     * @param expectedHeight - The expected height of the modal window
     * @returns The layout details including left and top positions, as well as computed width and height
     */
    layout(expectedWidth: number, expectedHeight: number) {
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const left = screenWidth / 2 - expectedWidth / 2;
        const top = screenHeight / 2 - expectedHeight / 2;

        const computedWidth = Math.min(expectedWidth, screenWidth);
        const computedHeight = Math.min(expectedHeight, screenHeight);

        return { left: Math.max(left, 0), top: Math.max(top, 0), computedWidth, computedHeight };
    }

    /**
     * Opens a modal window with the specified WebSocket client ID
     */
    open() {
        if (!this.wsClientId) {
            this.errorHandler('missing_ws_client_id', 'Missing WS Client ID while opening modal');
            return;
        }

        const popup = window.open(this.url + '&ws_client_id=' + this.wsClientId, '_blank', this.featuresToString());

        if (!popup || popup.closed || typeof popup.closed == 'undefined') {
            this.errorHandler('blocked_by_browser', 'Modal blocked by browser');
            return;
        }

        this.modal = popup;
    }

    /**
     * Converts the features object of this class to a string
     * @returns The string representation of features
     */
    featuresToString(): string {
        const features = this.features;
        const featuresAsString: string[] = [];

        for (const key in features) {
            featuresAsString.push(key + '=' + features[key]);
        }

        return featuresAsString.join(',');
    }

    /**
     * Close modal, if opened
     */
    close() {
        if (this.modal && !this.modal.closed) {
            this.modal.close();
        }
    }
}
