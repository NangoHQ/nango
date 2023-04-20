/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

const prodHost = 'https://api.nango.dev';
const stagingHost = 'https://staging.nango.dev';
const debugLogPrefix = 'NANGO DEBUG LOG: ';

const enum WSMessageType {
    ConnectionAck = 'connection_ack',
    Error = 'error',
    Success = 'success'
}

export default class Nango {
    private hostBaseUrl: string;
    private status: AuthorizationStatus;
    private publicKey: string | undefined;
    private debug: boolean = false;

    constructor(config: { host?: string; publicKey?: string; debug?: boolean } = {}) {
        config.host = config.host || prodHost; // Default to Nango Cloud.
        this.debug = config.debug || false;

        if (this.debug) {
            console.log(debugLogPrefix, `Debug mode is enabled.`);
            console.log(debugLogPrefix, `Using host: ${config.host}.`);
        }

        this.hostBaseUrl = config.host.slice(-1) === '/' ? config.host.slice(0, -1) : config.host; // Remove trailing slash.
        this.status = AuthorizationStatus.IDLE;
        this.publicKey = config.publicKey;

        if (this.isCloud() && !config.publicKey) {
            throw new Error('You should specify a Public Key when using Nango Cloud (cf. documentation).');
        }

        try {
            new URL(this.hostBaseUrl);
        } catch (err) {
            throw new Error(`Invalid URL provided for the Nango host: ${this.hostBaseUrl}`);
        }

        if (!window) {
            const errorMessage = "Couldn't initialize Nango frontend. The window object is undefined. Are you using Nango frontend from a browser?";
            throw new Error(errorMessage);
        }
    }

    public auth(providerConfigKey: string, connectionId: string, connectionConfig?: ConnectionConfig): Promise<any> {
        const url = this.hostBaseUrl + `/oauth/connect/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig)}`;

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
            new AuthorizationModal(this.hostBaseUrl, url, successHandler, errorHandler, this.debug);
        });
    }

    private toQueryString(connectionId: string, connectionConfig?: ConnectionConfig): string {
        let query: string[] = [];

        if (connectionId) {
            query.push(`connection_id=${connectionId}`);
        }

        if (this.publicKey) {
            query.push(`public_key=${this.publicKey}`);
        }

        if (connectionConfig != null) {
            for (const param in connectionConfig.params) {
                const val = connectionConfig.params[param];
                if (typeof val === 'string') {
                    query.push(`params[${param}]=${val}`);
                }
            }
        }

        return query.length === 0 ? '' : '?' + query.join('&');
    }

    private isCloud() {
        return this.hostBaseUrl === prodHost || this.hostBaseUrl === stagingHost;
    }
}

interface ConnectionConfig {
    params: Record<string, string>;
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
        host: string,
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

        this.swClient = new WebSocket(host.replace('https://', 'wss://').replace('http://', 'ws://'));

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
        let data = JSON.parse(message.data);

        switch (data.message_type) {
            case WSMessageType.ConnectionAck:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Connection ack received. Opening modal...');
                }

                let wsClientId = data.ws_client_id;
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

        for (let key in features) {
            featuresAsString.push(key + '=' + features[key]);
        }

        return featuresAsString.join(',');
    }
}
