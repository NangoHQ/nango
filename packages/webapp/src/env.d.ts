export {};

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            PORT: string;
            REACT_APP_ENV: 'development' | 'staging' | 'production' | 'hosted';
            REACT_APP_PUBLIC_POSTHOG_KEY: string;
            REACT_APP_PUBLIC_POSTHOG_HOST: string;
        }
    }
}
