declare global {
    namespace Express {
        interface User {
            email: string;
            name: string;
            id: number;
        }
    }
}

declare module 'express-session' {
    interface SessionData {
        user: {
            email: string;
            name: string;
            id: number;
        };
        debugMode?: boolean;
    }
}

// https://stackoverflow.com/questions/65805015/extending-session-object-in-express-session
// required to re-export the types
export {};
