export interface License {
    version: 1;
    installation_id: string;
    name: string;
    issued_at: string;
    expires_at: string;
    grace_until: string;
    telemetry: boolean;
}
