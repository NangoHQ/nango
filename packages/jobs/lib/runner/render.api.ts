import axios from 'axios';

import type { AxiosInstance, AxiosResponse } from 'axios';

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
        serviceDetails: { runtime: 'image'; plan: 'starter' | 'standard' | 'pro' | 'pro_plus' | 'pro_max' | 'pro_ultra' };
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
