import { apiFetch } from '../utils/api';

import type { PatchFlowDisable, PatchFlowEnable, PatchFlowFrequency, PostPreBuiltDeploy, PutUpgradePreBuiltFlow } from '@nangohq/types';

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

export async function apiPreBuiltUpgrade(env: string, body: PutUpgradePreBuiltFlow['Body']) {
    const res = await apiFetch(`/api/v1/flows/pre-built/upgrade?env=${env}`, {
        method: 'PUT',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PutUpgradePreBuiltFlow['Reply']
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

export async function apiFlowUpdateFrequency(env: string, params: PatchFlowFrequency['Params'], body: PatchFlowFrequency['Body']) {
    const res = await apiFetch(`/api/v1/flows/${params.id}/frequency?env=${env}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PatchFlowFrequency['Reply']
    };
}
