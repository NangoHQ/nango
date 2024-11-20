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
    declare class Player {
        constructor(id: string, obj: Record<string, any>);
        stopVideo(): void;
    }

    interface Window {
        _env: WindowEnv;
        YT: {
            Player: Player;
        };
    }
}
