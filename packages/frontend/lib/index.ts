/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

const prodHost = 'https://api.nango.dev';
const debugLogPrefix = 'NANGO DEBUG LOG: ';

const enum WSMessageType {
    ConnectionAck = 'connection_ack',
    Error = 'error',
    Success = 'success'
}

type AuthError = { message: string; type: string };

export default class Nango {
    private hostBaseUrl: string;
    private websocketsBaseUrl: string;
    private status: AuthorizationStatus;
    private publicKey: string;
    private debug = false;

    constructor(config: { host?: string; websocketsPath?: string; publicKey: string; debug?: boolean }) {
        config.host = config.host || prodHost; // Default to Nango Cloud.
        config.websocketsPath = config.websocketsPath || '/'; // Default to root path.
        this.debug = config.debug || false;

        if (this.debug) {
            console.log(debugLogPrefix, `Debug mode is enabled.`);
            console.log(debugLogPrefix, `Using host: ${config.host}.`);
        }

        this.hostBaseUrl = config.host.slice(-1) === '/' ? config.host.slice(0, -1) : config.host; // Remove trailing slash.
        this.status = AuthorizationStatus.IDLE;
        this.publicKey = config.publicKey;

        if (!config.publicKey) {
            throw new Error('You must specify a public key (cf. documentation).');
        }

        try {
            const baseUrl = new URL(this.hostBaseUrl);
            // Build the websockets url based on the host url.
            // The websockets path is considered relative to the baseUrl, and with the protocol updated
            const websocketUrl = new URL(config.websocketsPath, baseUrl);
            this.websocketsBaseUrl = websocketUrl.toString().replace('https://', 'wss://').replace('http://', 'ws://');
        } catch (err) {
            throw new Error(`Invalid URL provided for the Nango host: ${this.hostBaseUrl}`);
        }
    }

    public auth(
        providerConfigKey: string,
        connectionId: string,
        conectionConfigOrCredentials?: ConnectionConfig | BasicApiCredentials | ApiKeyCredentials
    ): Promise<{ providerConfigKey: string; connectionId: string } | AuthError> {
        if (conectionConfigOrCredentials && 'credentials' in conectionConfigOrCredentials && Object.keys(conectionConfigOrCredentials.credentials).length > 0) {
            const credentials = conectionConfigOrCredentials.credentials as BasicApiCredentials | ApiKeyCredentials;
            const { credentials: _, ...connectionConfig } = conectionConfigOrCredentials as ConnectionConfig;

            return this.apiAuth(providerConfigKey, connectionId, this.convertCredentialsToConfig(credentials), connectionConfig);
        }

        const url =
            this.hostBaseUrl + `/oauth/connect/${providerConfigKey}${this.toQueryString(connectionId, conectionConfigOrCredentials as ConnectionConfig)}`;

        try {
            new URL(url);
        } catch (err) {
            throw new Error(`Could not construct valid Nango URL based on provided parameters: ${url}`);
        }

        return new Promise((resolve, reject) => {
            const successHandler = (providerConfigKey: string, connectionId: string) => {
                if (this.status !== AuthorizationStatus.BUSY) {
                    return;
                }

                this.status = AuthorizationStatus.DONE;

                return resolve({
                    providerConfigKey: providerConfigKey,
                    connectionId: connectionId
                });
            };

            const errorHandler = (errorType: string, errorDesc: string) => {
                if (this.status !== AuthorizationStatus.BUSY) {
                    return;
                }

                this.status = AuthorizationStatus.DONE;

                return reject({
                    message: errorDesc,
                    type: errorType
                });
            };

            // Save authorization status (for handler)
            this.status = AuthorizationStatus.BUSY;

            // Open authorization modal
            new AuthorizationModal(this.websocketsBaseUrl, url, successHandler, errorHandler, this.debug);
        });
    }

    public convertCredentialsToConfig(credentials: BasicApiCredentials | ApiKeyCredentials): ConnectionConfig {
        const params: Record<string, string> = {};

        if ('username' in credentials) {
            params['username'] = credentials.username || '';
        }
        if ('password' in credentials) {
            params['password'] = credentials.password || '';
        }
        if ('apiKey' in credentials) {
            params['apiKey'] = credentials.apiKey || '';
        }

        return { params };
    }

    private async apiAuth(
        providerConfigKey: string,
        connectionId: string,
        connectionConfigWithCredentials: ConnectionConfig,
        connectionConfig: ConnectionConfig
    ): Promise<{ providerConfigKey: string; connectionId: string } | AuthError> {
        const { params: credentials } = connectionConfigWithCredentials as ConnectionConfig;

        if (!credentials) {
            throw new Error('You must specify credentials.');
        }

        if ('apiKey' in credentials) {
            const apiKeyCredential = credentials as ApiKeyCredentials;
            const url = this.hostBaseUrl + `/api-auth/api-key/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(apiKeyCredential)
            });

            if (!res.ok) {
                const errorResponse = await res.json();
                throw { ...errorResponse, message: errorResponse.error };
            }

            return res.json();
        }

        if ('username' in credentials || 'password' in credentials) {
            const basicCredentials = credentials as BasicApiCredentials;
            if (!basicCredentials.username) {
                throw new Error('You must specify a username.');
            }

            const url = this.hostBaseUrl + `/api-auth/basic/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig as ConnectionConfig)}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(basicCredentials)
            });

            if (!res.ok) {
                const errorResponse = await res.json();
                throw { ...errorResponse, message: errorResponse.error };
            }

            return res.json();
        }

        return Promise.reject('Something went wrong with the API authorization');
    }

    private toQueryString(connectionId: string, connectionConfig?: ConnectionConfig): string {
        const query: string[] = [];

        if (connectionId) {
            query.push(`connection_id=${connectionId}`);
        }

        query.push(`public_key=${this.publicKey}`);

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

            for (const param in connectionConfig.authorization_params) {
                const val = connectionConfig.authorization_params[param];
                if (typeof val === 'string') {
                    query.push(`authorization_params[${param}]=${val}`);
                }
            }
        }

        return query.length === 0 ? '' : '?' + query.join('&');
    }
}

interface ConnectionConfig {
    params: Record<string, string>;
    hmac?: string;
    user_scope?: string[];
    authorization_params?: Record<string, string>;
    credentials?: BasicApiCredentials | ApiKeyCredentials;
}

interface BasicApiCredentials {
    username?: string;
    password?: string;
}

interface ApiKeyCredentials {
    apiKey?: string;
}

enum AuthorizationStatus {
    IDLE,
    BUSY,
    DONE
}

/**
 * AuthorizationModal class
 */
class AuthorizationModal {
    private url: string;
    private features: { [key: string]: string | number };
    private width = 500;
    private height = 600;
    private modal: Window;
    private swClient: WebSocket;
    private debug: boolean;

    constructor(
        webSocketUrl: string,
        url: string,
        successHandler: (providerConfigKey: string, connectionId: string) => any,
        errorHandler: (errorType: string, errorDesc: string) => any,
        debug?: boolean
    ) {
        // Window modal URL
        this.url = url;
        this.debug = debug || false;

        const { left, top, computedWidth, computedHeight } = this.layout(this.width, this.height);

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

        this.modal = window.open('', '_blank', this.featuresToString())!;

        this.swClient = new WebSocket(webSocketUrl);

        this.swClient.onmessage = (message: MessageEvent<any>) => {
            this.handleMessage(message, successHandler, errorHandler);
        };
    }

    /**
     * Handles the messages received from the Nango server via WebSocket.
     */
    handleMessage(
        message: MessageEvent<any>,
        successHandler: (providerConfigKey: string, connectionId: string) => any,
        errorHandler: (errorType: string, errorDesc: string) => any
    ) {
        const data = JSON.parse(message.data);

        switch (data.message_type) {
            case WSMessageType.ConnectionAck:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Connection ack received. Opening modal...');
                }

                const wsClientId = data.ws_client_id;
                this.open(wsClientId);
                break;
            case WSMessageType.Error:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Error received. Rejecting authorization...');
                }

                errorHandler(data.error_type, data.error_desc);
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
                    console.log(debugLogPrefix, 'Unkown message type received from Nango server. Ignoring...');
                }
                return;
        }
    }

    /**
     * The modal is expected to be in the center of the screen.
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
     * Open the modal
     */
    open(wsClientId: string) {
        this.modal.location = this.url + '&ws_client_id=' + wsClientId;
        return this.modal;
    }

    /**
     * Helper to convert the features object of this class
     * to the comma-separated list of window features required
     * by the window.open() function.
     */
    featuresToString(): string {
        const features = this.features;
        const featuresAsString: string[] = [];

        for (const key in features) {
            featuresAsString.push(key + '=' + features[key]);
        }

        return featuresAsString.join(',');
    }
}
