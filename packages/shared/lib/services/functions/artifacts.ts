const LOCAL_FILE_LOCATION = '_LOCAL_FILE_';

function localBase({ integrationId, name }: { integrationId: string; name: string }): string {
    return `${integrationId}/functions/${name}`;
}

export function functionArtifactPaths({
    environmentName,
    accountId,
    environmentId,
    integrationId,
    name,
    version
}: {
    environmentName: string;
    accountId: number;
    environmentId: number;
    integrationId: string;
    name: string;
    version: string;
}): Record<'js' | 'ts', { destinationPath: string; destinationLocalFileName: string }> {
    const remote = `${environmentName}/account/${accountId}/environment/${environmentId}/config/${integrationId}/functions/${name}/${version}`;
    const local = localBase({ integrationId, name });
    return {
        js: { destinationPath: `${remote}.js`, destinationLocalFileName: `${local}.js` },
        ts: { destinationPath: `${remote}.ts`, destinationLocalFileName: `${local}.ts` }
    };
}

export interface SourceFileRef {
    kind: 'local' | 'remote';
    path: string;
}

export function functionSourceFile({ integrationId, name, fileLocation }: { integrationId: string; name: string; fileLocation: string }): SourceFileRef {
    if (fileLocation === LOCAL_FILE_LOCATION) {
        return { kind: 'local', path: `${localBase({ integrationId, name })}.ts` };
    }
    return { kind: 'remote', path: `${fileLocation.replace(/\.js$/, '')}.ts` };
}
