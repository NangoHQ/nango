const en = {
    common: {
        close: 'Close',
        loading: 'Loading',
        back: 'Back',
        finish: 'Finish',
        tryAgain: 'Try Again',
        connecting: 'Connecting...',
        connect: 'Connect',
        viewGuide: 'View connection guide',
        needHelp: 'Need help?'
    },
    integrationsList: {
        title: 'Select Integration',
        description: 'Please select an API integration from the list below.',
        noIntegrations: 'No integration found.',
        connectTo: 'Connect to {provider}',
        error: 'An error occurred while loading configuration'
    },
    go: {
        linkAccount: 'Link {provider} Account',
        connect: 'Connect',
        success: 'Success!',
        successMessage: "You've successfully set up your {provider} integration.",
        connectionFailed: 'Connection failed',
        tryAgain: 'Please try again',
        backToList: 'Back to integrations list',
        willConnect: "We'll connect you to {provider}.",
        popupWarning: "A pop-up will open, please make sure your browser doesn't block pop-ups.",
        popupBlocked: 'Auth pop-up blocked by your browser, please allow pop-ups to open.',
        popupClosed: 'The auth pop-up was closed before the end of the process, please try again.',
        invalidCredentials: '{provider} did not validate your credentials. Please check the values and try again.',
        resourceCapped: 'You have reached the maximum number of connections allowed. Please reach out to the admin.',
        invalidPreconfigured: 'A pre-configured field set by the administrator is invalid, please reach out to support.'
    }
};

export default en;
export type Translation = typeof en;
