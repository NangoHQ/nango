/*
 * Copyright (c) 2024 Nango, all rights reserved.
 */
import { AuthorizationModal, computeLayout, windowFeaturesToString } from './authModal.js';
import { ConnectUI } from './connectUI.js';

import type { ConnectUIProps } from './connectUI';
import type {
    ApiKeyCredentials,
    AppStoreCredentials,
    AuthErrorType,
    AuthOptions,
    AuthResult,
    BasicApiCredentials,
    BillCredentials,
    ConnectionConfig,
    ErrorHandler,
    JwtCredentials,
    OAuth2ClientCredentials,
    OAuthCredentialsOverride,
    SignatureCredentials,
    TBACredentials,
    TwoStepCredentials
} from './types';
import type { PostPublicUnauthenticatedAuthorization } from '@nangohq/types';

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
    private publicKey: string | undefined;
    private connectSessionToken: string | undefined;
    private debug = false;
    private width: number = 500;
    private height: number = 600;
    private tm: null | NodeJS.Timer = null;

    // Do not rename, part of the public api
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

        // -----------
        // Non popup auth
        // -----------
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

        // -----------
        // Auth with popup (e.g: OAuth)
        // -----------

        // /!\ /!\ /!\ /!\
        //
        // Some popup blocker are more sensitive than others
        // e.g: safari is blocking any popup opened in a different function or in async mode so it has to be opened here before everything else
        //
        const modal = window.open('', '_blank', windowFeaturesToString(computeLayout({ expectedWidth: this.width, expectedHeight: this.height })));

        return new Promise<AuthResult>((resolve, reject) => {
            const successHandler = (providerConfigKey: string, connectionId: string, isPending = false) => {
                resolve({ providerConfigKey: providerConfigKey, connectionId: connectionId, isPending });
                return;
            };

            const errorHandler: ErrorHandler = (errorType, errorDesc) => {
                reject(new AuthError(errorDesc, errorType));
                return;
            };

            // Clear state if the modal is already opened
            if (this.win) {
                this.clear();
            }

            if (!modal || modal.closed || typeof modal.closed == 'undefined') {
                errorHandler('blocked_by_browser', 'Modal blocked by browser');
                return;
            }

            let url: URL;
            try {
                url = new URL(`${this.hostBaseUrl}/oauth/connect/${providerConfigKey}${this.toQueryString(connectionId, options as ConnectionConfig)}`);
            } catch {
                errorHandler('invalidHostUrl', 'Invalid URL provided for the Nango host.');
                return;
            }

            this.win = new AuthorizationModal({ baseUrl: url, debug: this.debug, webSocketUrl: this.websocketsBaseUrl, successHandler, errorHandler });
            this.win.setModal(modal);

            this.tm = setInterval(() => {
                if (!this.win || !this.win.modal) {
                    return;
                }

                if (this.win.modal.window && !this.win.modal.closed) {
                    return;
                }

                if (this.win.isProcessingMessage) {
                    // Modal is still processing a web socket message from the server
                    // We ignore the window being closed for now
                    return;
                }

                if (options?.detectClosedAuthWindow) {
                    // Unfortunately some third party are blocking us from accessing the popup
                    // So we can't reliably close the popup and websocket connection
                    clearInterval(this.tm as unknown as number);
                    this.win.close();

                    this.win = null;
                    reject(new AuthError('The authorization window was closed before the authorization flow was completed', 'windowClosed'));
                }
            }, 500);
        }).finally(() => {
            this.clear();
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
            } catch (err) {
                console.log('err', err);
                // do nothing
            }
            this.win = null;
        }
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

        if (
            // for backwards compatibility with the old JWT credentials (ghost-admin)
            'privateKey' in credentials ||
            ('type' in credentials && credentials.type === 'JWT')
        ) {
            const { privateKey, ...rest } = credentials;
            const params: Record<string, any> = { ...rest };

            if (privateKey && typeof privateKey === 'object' && 'id' in privateKey && 'secret' in privateKey) {
                params['privateKey'] = privateKey;
            }

            return { params: credentials } as unknown as ConnectionConfig;
        }

        if ('privateKeyId' in credentials && 'issuerId' in credentials && 'privateKey' in credentials) {
            const appStoreCredentials: { params: Record<string, string | string[]> } = {
                params: {
                    privateKeyId: credentials['privateKeyId'],
                    issuerId: credentials['issuerId'],
                    privateKey: credentials['privateKey']
                }
            };

            if ('scope' in credentials && (typeof credentials['scope'] === 'string' || Array.isArray(credentials['scope']))) {
                appStoreCredentials.params['scope'] = credentials['scope'];
            }
            return appStoreCredentials as unknown as ConnectionConfig;
        }

        if ('client_id' in credentials && 'client_secret' in credentials) {
            const oauth2CCCredentials: OAuth2ClientCredentials = {
                client_id: credentials.client_id,
                client_secret: credentials.client_secret,
                client_certificate: credentials.client_certificate,
                client_private_key: credentials.client_private_key
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

        if ('username' in credentials && 'password' in credentials && 'organization_id' in credentials && 'dev_key' in credentials) {
            const BillCredentials: BillCredentials = {
                username: credentials.username,
                password: credentials.password,
                organization_id: credentials.organization_id,
                dev_key: credentials.dev_key
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

        if ('privateKey' in credentials || ('type' in credentials && credentials['type'] === 'JWT')) {
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
