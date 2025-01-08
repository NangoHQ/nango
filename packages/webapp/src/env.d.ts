import type { WindowEnv } from '@nangohq/types';

export {};

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            PORT: string;
            REACT_APP_ENV: 'development' | 'staging' | 'production' | 'hosted' | 'enterprise';
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
        // koala
        ko?: { identify: (str: string, ...args: any[]) => void; reset: () => void };

        // Youtube
        YT: {
            Player: Player;
        };
    }
}
