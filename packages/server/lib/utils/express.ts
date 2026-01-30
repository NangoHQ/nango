import type { ConnectSession, DBEnvironment, DBPlan, DBTeam, DBUser, InternalEndUser } from '@nangohq/types';

// Types are historically loose so we need to fix them at some point
// export type RequestLocals =
//     | {
//           authType: 'connectSession';
//           account: DBTeam;
//           environment: DBEnvironment;
//           connectSession: ConnectSession;
//           endUser: EndUser;
//       }
//     | {
//           authType: 'publicKey';
//           account: DBTeam;
//           environment: DBEnvironment;
//       }
//     | {
//           authType: 'basic' | 'session' | 'secretKey' | 'adminKey' | 'none';
//           account?: DBTeam;
//           environment?: DBEnvironment;
//           user: Pick<DBUser, 'id' | 'email' | 'name'>;
//       };

export interface RequestLocals {
    authType?: 'secretKey' | 'publicKey' | 'basic' | 'adminKey' | 'none' | 'session' | 'connectSession';
    user?: DBUser;
    account?: DBTeam;
    environment?: DBEnvironment;
    connectSession?: ConnectSession;
    endUser?: InternalEndUser | null;
    plan?: DBPlan | null;
    lang?: string;
}
