import type { User } from '@nangohq/shared';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

export interface RequestLocals {
    authType?: 'secretKey' | 'publicKey' | 'basic' | 'adminKey' | 'none' | 'session';
    user?: Pick<User, 'id' | 'email'>;
    account?: DBTeam;
    environment?: DBEnvironment;
}
