import type { Timestamps } from '../db.js';

export type SelfHostingInstallationMode = 'byoc' | 'self_managed';

export interface DBSelfHostingInstallation extends Timestamps {
    id: number;
    uuid: string;
    customer_id: number;
    name: string;
    mode: SelfHostingInstallationMode;
    /** A token whose `iat` is before this instant is rejected; null accepts any. */
    tokens_revoked_before: Date | null;
    disabled_at: Date | null;
    last_seen_at: Date | null;
}
