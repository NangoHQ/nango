import type { ConnectUIEvent, ConnectUIEventToken } from './types.js';
import type { MaybePromise } from '@nangohq/types';

export type OnConnectEvent = (event: ConnectUIEvent) => MaybePromise<void>;
export interface ConnectUIProps {
    /**
     * The unique token to identify your user. It is required to make UI work but can be set asynchronously.
     */
    sessionToken?: string | undefined;
    /**
     * The base URL to load the UI
     * @default `https://connect.nango.dev`
     */
    baseURL?: string;
    /**
     * The base URL to reach Nango API
     * @default `https://api.nango.dev`
     */
    apiURL?: string;
    /**
     * A callback to listen to events sent by Nango Connect
     */
    onEvent?: OnConnectEvent;
    /**
     * Control OAuth popup close detection.
     * If set to false a closed popup will not be detected as a failed authorization
     * @default false
     */
    detectClosedAuthWindow?: boolean;

    /**
     * The language to use for the UI. Defaults to browser language or english if not supported.
     * @example `en` or `fr`
     */
    lang?: string;
}

export class ConnectUI {
    iframe: HTMLIFrameElement | null = null;

    private isReady = false;
    private listener: ((this: Window, ev: MessageEvent) => any) | null = null;
    private sessionToken;
    private baseURL;
    private apiURL;
    private onEvent;
    private detectClosedAuthWindow?: boolean | undefined;
    private lang?: string | undefined;
    private container: HTMLElement | null = null;
    private isEmbedded = false;

    constructor({
        sessionToken,
        baseURL = 'https://connect.nango.dev',
        apiURL = 'https://api.nango.dev',
        detectClosedAuthWindow,
        onEvent,
        lang
    }: ConnectUIProps) {
        this.sessionToken = sessionToken;
        this.baseURL = baseURL;
        this.apiURL = apiURL;
        this.onEvent = onEvent;
        this.detectClosedAuthWindow = detectClosedAuthWindow;
        this.lang = lang;
    }

    /**
     * Open UI in an iframe and listen to events (fullscreen mode)
     */
    open() {
        console.log('Opening connect ui');
        const baseURL = new URL(this.baseURL);
        if (this.apiURL) {
            baseURL.searchParams.append('apiURL', this.apiURL);
        }
        if (this.detectClosedAuthWindow) {
            baseURL.searchParams.append('detectClosedAuthWindow', String(this.detectClosedAuthWindow));
        }
        if (this.lang) {
            baseURL.searchParams.append('lang', this.lang);
        }

        // Create an iframe that will contain the ConnectUI on top of existing UI
        const iframe = this.createIframe('fullscreen');

        this.iframe = iframe;
        this.isEmbedded = false;
        document.body.append(iframe);

        document.body.style.overflow = 'hidden';

        this.setupEventListeners();
    }

    /**
     * Embed UI in an iframe within a specific container element
     */
    embed(container: HTMLElement) {
        console.log('Embedding connect ui');
        const baseURL = new URL(this.baseURL);
        if (this.apiURL) {
            baseURL.searchParams.append('apiURL', this.apiURL);
        }
        if (this.detectClosedAuthWindow) {
            baseURL.searchParams.append('detectClosedAuthWindow', String(this.detectClosedAuthWindow));
        }
        if (this.lang) {
            baseURL.searchParams.append('lang', this.lang);
        }

        // Create an iframe that will contain the ConnectUI within the container
        const iframe = this.createIframe('embedded');

        this.iframe = iframe;
        this.container = container;
        this.isEmbedded = true;
        container.appendChild(iframe);

        this.setupEventListeners();
    }

    createIframe(mode: 'fullscreen' | 'embedded' = 'fullscreen') {
        const baseURL = new URL(this.baseURL);
        if (this.apiURL) {
            baseURL.searchParams.append('apiURL', this.apiURL);
        }
        if (this.detectClosedAuthWindow) {
            baseURL.searchParams.append('detectClosedAuthWindow', String(this.detectClosedAuthWindow));
        }
        if (this.lang) {
            baseURL.searchParams.append('lang', this.lang);
        }
        if (mode === 'embedded') {
            baseURL.searchParams.append('embedded', 'true');
        }

        // Create an iframe that will contain the ConnectUI
        const iframe = document.createElement('iframe');
        iframe.src = baseURL.href;
        iframe.id = 'connect-ui';
        iframe.style.backgroundColor = 'transparent';
        iframe.style.border = 'none';

        if (mode === 'fullscreen') {
            // Fullscreen mode - covers the entire viewport
            iframe.style.position = 'fixed';
            iframe.style.zIndex = '9999';
            iframe.style.top = '0';
            iframe.style.left = '0';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '100vw';
            iframe.style.height = '100vh';
        } else {
            // Embedded mode - fits within the container
            iframe.style.position = 'relative';
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.minHeight = '400px';
        }

        return iframe;
    }

    private setupEventListeners() {
        // Listen to event sent from ConnectUI
        this.listener = (event) => {
            if (event.origin !== this.baseURL) {
                return;
            }

            if (typeof event.data !== 'object' || !event.data || !event.data.type) {
                return;
            }

            const evt = event.data as ConnectUIEvent;

            switch (evt.type) {
                case 'ready': {
                    this.isReady = true;
                    this.sendSessionToken();

                    break;
                }
                case 'close': {
                    this.close();
                    break;
                }
                default: {
                    break;
                }
            }

            // Transfer event to customers' frontend
            if (this.onEvent) {
                void this.onEvent(evt);
            }
        };
        window.addEventListener('message', this.listener, false);
    }

    /**
     * Set the session token and send it to the Connect UI iframe
     */
    setSessionToken(sessionToken: string) {
        this.sessionToken = sessionToken;
        if (this.isReady) {
            this.sendSessionToken();
        }
    }

    /**
     * Close UI and clear state
     */
    close() {
        if (this.listener) {
            window.removeEventListener('message', this.listener);
        }
        if (this.iframe) {
            if (this.isEmbedded && this.container) {
                this.container.removeChild(this.iframe);
            } else {
                document.body.removeChild(this.iframe);
                document.body.style.overflow = '';
            }
            this.iframe = null;
            this.container = null;
        }
    }

    private sendSessionToken() {
        if (!this.sessionToken) {
            return;
        }

        const data: ConnectUIEventToken = { type: 'session_token', sessionToken: this.sessionToken };
        this.iframe?.contentWindow?.postMessage(data, '*');
    }
}
