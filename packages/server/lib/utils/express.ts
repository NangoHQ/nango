import type { User } from '@nangohq/shared';
import type { DBEnvironment, DBTeam, ConnectSession } from '@nangohq/types';

export interface RequestLocals {
    authType?: 'secretKey' | 'publicKey' | 'basic' | 'adminKey' | 'none' | 'session' | 'connectSession';
    user?: Pick<User, 'id' | 'email' | 'name'>;
    account?: DBTeam;
    environment?: DBEnvironment;
    connectSession?: ConnectSession;
}
