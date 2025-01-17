import type { AxiosInstance, AxiosResponse } from 'axios';
import axios from 'axios';

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
        serviceDetails: { env: string; plan: 'starter' | 'standard' | 'pro' };
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
