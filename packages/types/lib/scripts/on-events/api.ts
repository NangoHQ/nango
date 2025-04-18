import type { DBOnEventScript } from './db.js';

export type OnEventType = 'post-connection-creation' | 'pre-connection-deletion';

export interface OnEventScript {
    id: DBOnEventScript['id'];
    configId: DBOnEventScript['config_id'];
    providerConfigKey: string;
    name: DBOnEventScript['name'];
    fileLocation: DBOnEventScript['file_location'];
    version: DBOnEventScript['version'];
    active: DBOnEventScript['active'];
    event: OnEventType;
    createdAt: DBOnEventScript['created_at'];
    updatedAt: DBOnEventScript['updated_at'];
}
