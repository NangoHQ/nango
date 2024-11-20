import type { DBEnvironment, DBTeam, ConnectSession, DBUser } from '@nangohq/types';

export interface RequestLocals {
    authType?: 'secretKey' | 'publicKey' | 'basic' | 'adminKey' | 'none' | 'session' | 'connectSession';
    user?: Pick<DBUser, 'id' | 'email' | 'name'>;
    account?: DBTeam;
    environment?: DBEnvironment;
    connectSession?: ConnectSession;
}
