import type { WindowEnv } from '@nangohq/types';

export {};

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            PORT: string;
            REACT_APP_ENV: 'development' | 'staging' | 'production' | 'hosted' | 'enterprise';
            REACT_APP_PUBLIC_POSTHOG_KEY: string;
            REACT_APP_PUBLIC_POSTHOG_HOST: string;
        }
    }
}

declare global {
    interface Window {
        _env: WindowEnv;
        YT: {
            Player: (id: string, obj: Record<string, any>) => { stopVideo: () => void; on: (str: string, cb: (...opts: any[]) => void) => void };
        };
    }
}
