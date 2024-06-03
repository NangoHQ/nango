export interface IncomingPostConnectionScript {
    name: string;
    fileBody: {
        js: string;
        ts: string;
    };
}

export interface PostConnectionScriptByProvider {
    providerConfigKey: string;
    scripts: IncomingPostConnectionScript[];
}
