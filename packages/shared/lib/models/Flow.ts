export interface FlowDownloadBody {
    id?: number;
    name: string;
    provider: string;
    is_public: boolean;
    providerConfigKey: string;
    flowType: string;
}
