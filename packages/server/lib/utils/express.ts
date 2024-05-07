import type { Account, Environment, User } from '@nangohq/shared';

export interface RequestLocals {
    authType?: 'secretKey' | 'publicKey' | 'basic' | 'adminKey' | 'none' | 'session';
    user?: Pick<User, 'id' | 'email'>;
    account?: Account;
    environment?: Environment;
}
