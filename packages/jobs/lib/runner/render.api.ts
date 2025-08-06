import axios from 'axios';

import type { AxiosInstance, AxiosResponse } from 'axios';

// Render is somehow restarting services arbitrarily, which is causing the long running scripts to fail.
// We have asked them not to do that, and they came up with a workaround, making special instances available to us that are not restarted according to them.
// Note: Not all sizes are available for those special instances.
export type RenderPlan = 'Starter Nango' | 'Standard Nango' | 'Pro Nango' | 'pro_plus' | 'Pro Max Nango' | 'pro_ultra';

export class RenderAPI {
    httpClient: AxiosInstance;
    constructor(apiKey: string) {
        this.httpClient = axios.create({
            baseURL: 'https://api.render.com/v1',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: 'application/json'
            }
        });
    }

    async getServices(params: { name: string; type: string; limit: string }): Promise<AxiosResponse> {
        return await this.httpClient.get('/services', { params });
    }

    async createService(data: {
        type: string;
        name: string;
        ownerId: string;
        image: { ownerId: string; imagePath: string };
        serviceDetails: { runtime: 'image'; plan: RenderPlan };
        envVars: { key: string; value: string }[];
    }): Promise<AxiosResponse> {
        return await this.httpClient.post('/services', data);
    }

    async suspendService(params: { serviceId: string }): Promise<AxiosResponse> {
        return await this.httpClient.post(`/services/${params.serviceId}/suspend`, {});
    }

    async resumeService(params: { serviceId: string }): Promise<AxiosResponse> {
        return await this.httpClient.post(`/services/${params.serviceId}/resume`, {});
    }

    async deleteService(params: { serviceId: string }): Promise<AxiosResponse> {
        return await this.httpClient.delete(`/services/${params.serviceId}`, {});
    }
}
