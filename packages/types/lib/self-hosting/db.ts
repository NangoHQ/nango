import type { Timestamps } from '../db.js';

export type SelfHostingInstallationMode = 'byoc' | 'self_managed';
export type SelfHostingInstallationStage = 'production' | 'staging' | 'development';
export type SelfHostingInstallationAlerts = 'off' | 'slack' | 'oncall';

export interface DBSelfHostingCustomer extends Timestamps {
    id: number;
    name: string;
    deleted_at: Date | null;
}

export interface DBSelfHostingInstallation extends Timestamps {
    id: number;
    /** The only identity that leaves the registry: in the license, the tokens and the export files. */
    uuid: string;
    customer_id: number;
    name: string;
    mode: SelfHostingInstallationMode;
    stage: SelfHostingInstallationStage;
    telemetry: boolean;
    alerts: SelfHostingInstallationAlerts;
    deleted_at: Date | null;
    last_seen_at: Date | null;
}

export interface DBSelfHostingInstallationKey {
    id: number;
    installation_id: number;
    kid: string;
    public_key: string;
    created_at: Date;
    /** Set on rotation; the key still verifies files it signed until it is pruned. */
    deleted_at: Date | null;
}

export interface DBSelfHostingInstallationLicense {
    id: number;
    installation_id: number;
    issued_at: Date;
    expires_at: Date;
    grace_until: Date;
    /** The exact signed text, so the signature can be re-verified from the row. */
    license: string;
    signature: string;
    signing_kid: string;
    active: boolean;
    created_at: Date;
}
