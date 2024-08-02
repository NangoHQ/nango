export interface FlowDownloadBody {
    id?: number;
    name: string;
    provider: string;
    is_public: boolean;
    public_route?: string;
    providerConfigKey: string;
    flowType: string;
}
