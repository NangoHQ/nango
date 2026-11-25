export interface AdobeAnalyticsDiscoveryResponse {
    imsUserId: string;
    imsOrgs?: {
        imsOrgId: string;
        companies?: {
            globalCompanyId: string;
            companyName: string;
            apiRateLimitPolicy: string;
        }[];
    }[];
}
