/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

export default class Pizzly {
    private hostBaseUrl: string;
    private status: AuthorizationStatus;
    private publishableKey: string;

    constructor(hostBaseUrl: string, publishableKey: string) {
        this.hostBaseUrl = hostBaseUrl;
        this.status = AuthorizationStatus.IDLE;
        this.publishableKey = publishableKey;

        if (!window) {
            const errorMessage = "Couldn't initialize Pizzly frontend. The window object is undefined. Are you using Pizzly frontend from a browser?";
            throw new Error(errorMessage);
        }
    }

    public auth(providerConfigKey: string, connectionId: string): Promise<any> {
        const url = new URL(`/oauth/connect/${providerConfigKey}?connection_id=${connectionId}&pizzly_pkey=${this.publishableKey}`, this.hostBaseUrl).href;

        return new Promise((resolve, reject) => {
            const handler = (e?: MessageEvent) => {
                if (this.status !== AuthorizationStatus.BUSY) {
                    return;
                }

                // All sorts of extensions and pages might send messages so we need to filter the relevant ones.
                // Pizzly messages will always have the data.eventType attribute set.
                if (e && !e.data.eventType) {
                    return;
                }

                this.status = AuthorizationStatus.DONE;

                if (!e) {
                    const error = {
                        error: {
                            type: 'authorization_cancelled',
                            message: 'Authorization cancelled. The user has likely interrupted the process by closing the modal.'
                        }
                    };
                    return reject(error);
                }

                const { data: event } = e;

                if (event.eventType === 'AUTHORIZATION_SUCEEDED') {
                    return resolve(event.data);
                } else if (event.eventType === 'AUTHORIZATION_FAILED') {
                    return reject(event.data);
                }

                reject(new Error('Authorization failed. That’s all we know.'));
            };

            // Add an event listener on authorization modal
            //
            // Note: this adds one event listener for each authorization process.
            // In an application doing lots of connect, this can cause a memory issue.
            window.addEventListener('message', handler, false);

            // Save authorization status (for handler)
            this.status = AuthorizationStatus.BUSY;

            // Open authorization modal
            const modal = new AuthorizationModal(url);
            modal.open();
            modal.addEventListener('close', handler);
        });
    }
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
    private modal!: Window | null;

    constructor(url: string) {
        // Window modal URL
        this.url = url;

        const { left, top, computedWidth, computedHeight } = this.layout(this.width, this.height);

        // Window modal features
        this.features = {
            width: computedWidth,
            height: computedHeight,
            top,
            left,
            scrollbars: 'yes',
            resizable: 'yes',
            // noopener: 'no'
            //
            // Note: using "noopener=yes" seems safer here, as the modal will run on third-party websites.
            // But we need detect if the modal has been closed by the user, during the authorization process,
            // To do so, we are polling the modal status of the modal (using the read-only closed property).
            // If we can find a workaround that provides both the ability to use "noopener=yes"
            // and detect the modal close status, it will be safer to proceed so.
            status: 'no',
            toolbar: 'no',
            location: 'no',
            copyhistory: 'no',
            menubar: 'no',
            directories: 'no'
        };
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

    open() {
        const url = this.url;
        const windowName = '';
        const windowFeatures = this.featuresToString();
        this.modal = window.open(url, windowName, windowFeatures);
        return this.modal;
    }

    /**
     * Add event listener on the modal
     */

    addEventListener(eventType: string, handler: (e: any) => any): void {
        if (eventType !== 'close') {
            return;
        }

        if (!this.modal) {
            handler(undefined);
            return;
        }

        const interval = window.setInterval(() => {
            if (!this.modal || this.modal.closed) {
                let e = {
                    data: {
                        eventType: 'AUTHORIZATION_FAILED',
                        data: {
                            error: {
                                type: 'authorization_cancelled',
                                message: 'Authorization fail: The user has closed the authorization modal before the process was complete.'
                            }
                        }
                    }
                };
                handler(e);
                window.clearInterval(interval);
            }
        }, 100);
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
