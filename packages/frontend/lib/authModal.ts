import type { AuthErrorType, AuthResult, ErrorHandler } from './types.js';
import type { WebSocketConnectionMessage } from '@nangohq/types';

const debugLogPrefix = '[nango]';

export interface PopupLayout {
    width: number;
    height: number;
    top: number;
    left: number;
}

/**
 * Calculates the layout dimensions for a modal window based on the expected width and height
 * @param expectedWidth - The expected width of the modal window
 * @param expectedHeight - The expected height of the modal window
 * @returns The layout details including left and top positions, as well as computed width and height
 */
export function computeLayout({ expectedWidth, expectedHeight }: { expectedWidth: number; expectedHeight: number }): PopupLayout {
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const left = screenWidth / 2 - expectedWidth / 2;
    const top = screenHeight / 2 - expectedHeight / 2;

    const computedWidth = Math.min(expectedWidth, screenWidth);
    const computedHeight = Math.min(expectedHeight, screenHeight);

    return { left: Math.max(left, 0), top: Math.max(top, 0), width: computedWidth, height: computedHeight };
}

/**
 * Converts the features object of this class to a string
 * @returns The string representation of features
 */
export function windowFeaturesToString(layout: PopupLayout): string {
    const features: Record<string, string | number> = {
        ...layout,
        scrollbars: 'yes',
        resizable: 'yes',
        status: 'no',
        toolbar: 'no',
        location: 'no',
        copyhistory: 'no',
        menubar: 'no',
        directories: 'no'
    };
    const featuresAsString: string[] = [];

    for (const key in features) {
        featuresAsString.push(`${key}=${features[key]}`);
    }

    return featuresAsString.join(',');
}

/**
 * AuthorizationModal class
 */
export class AuthorizationModal {
    private baseURL: URL;
    private debug: boolean;
    private swClient: WebSocket;
    private errorHandler: ErrorHandler;
    public modal?: Window;
    public isProcessingMessage = false;

    constructor({
        baseUrl,
        debug,
        webSocketUrl,
        successHandler,
        errorHandler
    }: {
        baseUrl: URL;
        debug: boolean;
        webSocketUrl: string;
        successHandler: (authResult: AuthResult) => void;
        errorHandler: ErrorHandler;
    }) {
        this.baseURL = baseUrl;
        this.debug = debug;

        // Window modal features
        this.swClient = new WebSocket(webSocketUrl);
        this.errorHandler = errorHandler;

        this.swClient.onmessage = (message: MessageEvent) => {
            this.isProcessingMessage = true;
            this.handleMessage(message, successHandler);
            this.isProcessingMessage = false;
        };
    }

    setModal(modal: Window) {
        this.modal = modal;
    }

    /**
     * Handles the messages received from the Nango server via WebSocket
     * @param message - The message event containing data from the server
     * @param successHandler - The success handler function to be called when a success message is received
     */
    handleMessage(message: MessageEvent, successHandler: (authResult: AuthResult) => void) {
        const data = JSON.parse(message.data) as WebSocketConnectionMessage;

        switch (data.message_type) {
            case 'connection_ack': {
                if (this.debug) {
                    console.log(debugLogPrefix, 'Connection ack received. Opening modal...');
                }

                this.baseURL.searchParams.set('ws_client_id', data.ws_client_id);
                this.open();
                break;
            }
            case 'error':
                if (this.debug) {
                    console.log(debugLogPrefix, 'Error received. Rejecting authorization...');
                }

                this.errorHandler(data.error_type as AuthErrorType, data.error_desc);
                this.swClient.close();
                break;
            case 'success':
                if (this.debug) {
                    console.log(debugLogPrefix, 'Success received. Resolving authorization...');
                }

                successHandler({
                    providerConfigKey: data.provider_config_key,
                    connectionId: data.connection_id,
                    isPending: data.is_pending
                });

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
     * Opens a modal window with the specified WebSocket client ID
     */
    open() {
        if (!this.modal) {
            return;
        }

        if (this.debug) {
            console.log(debugLogPrefix, 'opening', this.baseURL.href);
        }
        this.modal.location = this.baseURL.href;

        if (!this.modal || this.modal.closed || typeof this.modal.closed == 'undefined') {
            this.errorHandler('blocked_by_browser', 'Modal blocked by browser');
            return;
        }
    }

    /**
     * Close modal, if opened
     */
    close() {
        if (this.modal && !this.modal.closed) {
            this.modal.close();
            delete this.modal;
        }
        this.swClient.close();

        // @ts-expect-error on purpose to free ref
        delete this.swClient;
    }
}
