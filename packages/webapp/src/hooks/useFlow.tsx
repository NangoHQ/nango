import type { PatchFlowDisable, PatchFlowEnable, PostPreBuiltDeploy } from '@nangohq/types';
import { apiFetch } from '../utils/api';

export async function apiPreBuiltDeployFlow(env: string, body: PostPreBuiltDeploy['Body']) {
    const res = await apiFetch(`/api/v1/flows/pre-built/deploy/?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostPreBuiltDeploy['Reply']
    };
}

export async function apiFlowEnable(env: string, params: PatchFlowEnable['Params'], body: PatchFlowEnable['Body']) {
    const res = await apiFetch(`/api/v1/flows/${params.id}/enable?env=${env}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PatchFlowEnable['Reply']
    };
}

export async function apiFlowDisable(env: string, params: PatchFlowDisable['Params'], body: PatchFlowDisable['Body']) {
    const res = await apiFetch(`/api/v1/flows/${params.id}/disable?env=${env}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PatchFlowDisable['Reply']
    };
}
