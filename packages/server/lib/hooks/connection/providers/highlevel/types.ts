export interface HighLevelAuthResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
    userType?: string;
    locationId?: string;
    companyId?: string;
    approvedLocations?: string[];
    userId: string;
    planId?: string;
    isBulkInstallation?: boolean;
}
