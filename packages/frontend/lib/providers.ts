interface ProviderOptions {
    detectClosedLoginWindow?: boolean;
}

export const providerOptions: Record<string, ProviderOptions> = {
    shopify: {
        detectClosedLoginWindow: false
    }
};
