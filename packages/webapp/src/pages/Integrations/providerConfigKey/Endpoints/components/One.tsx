import { Prism } from '@mantine/prism';
import { IconDownload } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocalStorage } from 'react-use';

import { ScriptSettings } from './ScriptSettings';
import { HttpLabel } from '../../../../../components/HttpLabel';
import { Info } from '../../../../../components/Info';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../../components/ui/Select';
import { Button } from '../../../../../components/ui/button/Button';
import { CopyButton } from '../../../../../components/ui/button/CopyButton';
import { Tag } from '../../../../../components/ui/label/Tag';
import { useEnvironment } from '../../../../../hooks/useEnvironment';
import { useToast } from '../../../../../hooks/useToast';
import { useStore } from '../../../../../store';
import { apiFetch } from '../../../../../utils/api';
import { getDefinition, isPrimitiveType } from '../../../../../utils/json-schema';
import { httpSnippet, nodeActionSnippet, nodeSyncSnippet } from '../../../../../utils/language-snippets';
import { getSyncResponse, modelToString, propertyToTypescriptExample } from '../../../../../utils/scripts';

import type { NangoSyncConfigWithEndpoint } from './List';
import type { GetIntegration } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

const syncDefaultQueryParams = [
    {
        name: 'modified_after',
        type: 'string',
        description: `A timestamp (e.g., 2023-05-31T11:46:13.390Z) used to fetch records modified after this date and time. If not provided, all records are returned. The modified_after parameter is less precise than cursor, as multiple records may share the same modification timestamp.`,
        optional: true
    },
    { name: 'limit', type: 'number', description: `The maximum number of records to return per page. Defaults to 100.`, optional: true },
    {
        name: 'cursor',
        type: 'string',
        description: `A marker used to fetch records modified after a specific point in time. If not provided, all records are returned. Each record includes a cursor value found in _nango_metadata.cursor. Save the cursor from the last record retrieved to track your sync progress. Use the cursor parameter together with the limit parameter to paginate through records. The cursor is more precise than modified_after, as it can differentiate between records with the same modification timestamp.`,
        optional: true
    },
    {
        name: 'filter',
        type: 'added | updated | deleted',
        description: `Filter to only show results that have been added or updated or deleted.`,
        optional: true
    }
];

const connectionId = '<CONNECTION_ID>';
export const EndpointOne: React.FC<{ integration: GetIntegration['Success']['data']; flow: NangoSyncConfigWithEndpoint }> = ({ integration, flow }) => {
    const env = useStore((state) => state.env);
    const baseUrl = useStore((state) => state.baseUrl);

    const { toast } = useToast();

    const { environmentAndAccount } = useEnvironment(env);
    const [language, setLanguage] = useLocalStorage<'node' | 'curl' | 'go' | 'javascript' | 'java' | 'php' | 'python'>('nango:snippet:language', 'node');
    const [inputModel, setInputModel] = useState<JSONSchema7 | undefined>();
    const [requestSnippet, setRequestSnippet] = useState('');
    const [requestSnippetCopy, setRequestSnippetCopy] = useState('');
    const [responseSnippet, setResponseSnippet] = useState('');

    useEffect(() => {
        const generate = async () => {
            const activeEndpointIndex = flow.endpoints.findIndex((endpoint) => {
                return endpoint.method === flow.endpoint.method && endpoint.path === flow.endpoint.path;
            });

            let inputModel = flow.input ? getDefinition(flow.input, flow.json_schema || {}) || undefined : undefined;
            // If it's primitive, it's an anonymous type, so we need to wrap it in an object
            if (inputModel && isPrimitiveType(inputModel)) {
                inputModel = { type: 'object', properties: { input: inputModel }, required: ['input'] };
            }
            setInputModel(inputModel);

            const outputModelName = Array.isArray(flow.returns) ? flow.returns[activeEndpointIndex] : flow.returns;
            let outputModel = getDefinition(outputModelName, flow.json_schema || {});
            // If it's primitive, it's an anonymous type, so we need to wrap it in an object
            if (outputModel && isPrimitiveType(outputModel)) {
                outputModel = { type: 'object', properties: { output: outputModel }, required: ['output'] };
            }

            const providerConfigKey = integration.integration.unique_key;
            const secretKey = environmentAndAccount!.environment.secret_key;

            // Request
            if (language === 'node') {
                setRequestSnippet(
                    flow.type === 'sync'
                        ? nodeSyncSnippet({ modelName: outputModelName, secretKey, connectionId, providerConfigKey })
                        : nodeActionSnippet({ actionName: flow.name, secretKey, connectionId, providerConfigKey, input: inputModel })
                );
                setRequestSnippetCopy(
                    flow.type === 'sync'
                        ? nodeSyncSnippet({ modelName: outputModelName, secretKey, connectionId, providerConfigKey, hideSecret: false })
                        : nodeActionSnippet({ actionName: flow.name, secretKey, connectionId, providerConfigKey, input: inputModel, hideSecret: false })
                );
            } else {
                setRequestSnippet(
                    await httpSnippet({
                        baseUrl,
                        endpoint: flow.endpoints[activeEndpointIndex],
                        secretKey,
                        connectionId,
                        providerConfigKey,
                        input: inputModel,
                        language: language === 'curl' ? 'shell' : language!
                    })
                );
                setRequestSnippetCopy(
                    await httpSnippet({
                        baseUrl,
                        endpoint: flow.endpoints[activeEndpointIndex],
                        secretKey,
                        connectionId,
                        providerConfigKey,
                        input: inputModel,
                        language: language === 'curl' ? 'shell' : language!,
                        hideSecret: false
                    })
                );
            }

            // Response
            let res = '';
            if (flow.type === 'sync') {
                res = outputModel ? getSyncResponse(outputModel) : 'no response';
            } else {
                res = outputModel ? modelToString(outputModel, true) : 'no response';
            }
            setResponseSnippet(res);
        };

        void generate();
    }, [flow, language, baseUrl, environmentAndAccount, integration]);

    const queryParams = useMemo(() => {
        return flow.type === 'sync' ? syncDefaultQueryParams : null;
    }, [flow]);

    async function onDownloadScript() {
        try {
            const { provider, unique_key } = integration.integration;
            const { id, name, version, type, is_public } = flow;

            const response = await apiFetch(`${baseUrl}/api/v1/flow/download?env=${env}`, {
                method: 'POST',
                body: JSON.stringify({
                    id,
                    name,
                    provider,
                    is_public,
                    providerConfigKey: unique_key,
                    flowType: type
                })
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            if (version) {
                a.download = `${provider}_${name}_v${version}.zip`;
            } else {
                a.download = `${provider}_${name}.zip`;
            }
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch {
            toast({
                title: 'Error downloading script',
                variant: 'error'
            });
        }
    }

    return (
        <div className="flex flex-col gap-10 text-white text-sm">
            <header className="bg-active-gray flex gap-10 justify-between p-5">
                <div className="flex flex-col gap-5 w-full">
                    <div className="flex items-center justify-between">
                        <h2>
                            <HttpLabel {...flow.endpoint} size="xl" />{' '}
                        </h2>
                        <Button variant="zombieGray" onClick={() => onDownloadScript()}>
                            <IconDownload size={16} />
                            Download Script
                        </Button>
                    </div>
                    <div>{flow.description}</div>
                </div>
            </header>

            {!flow.enabled && (
                <Info variant="warning">
                    This endpoint is disabled. To enable it, go to{' '}
                    <span onClick={() => document.getElementById('settings')?.scrollIntoView({ behavior: 'smooth' })} className="underline">
                        Endpoint Configuration
                    </span>
                </Info>
            )}

            <main className="flex gap-10">
                <div className="flex flex-col gap-10 w-1/2">
                    <div className=" flex flex-col gap-10">
                        {queryParams && (
                            <div className="bg-active-gray p-5 rounded-md">
                                <h3 className="text-xl font-semibold pb-6">Query Parameters</h3>
                                <div className="flex flex-col gap-5">
                                    {queryParams.map((queryParam) => {
                                        return (
                                            <div
                                                key={queryParam.name}
                                                className="flex flex-col pb-5 gap-2.5 border-b border-b-border-gray last-of-type:border-b-0"
                                            >
                                                <div className="flex justify-between">
                                                    <div className="flex gap-2">
                                                        <code className="font-code text-text-light-gray text-s">{queryParam.name}</code>
                                                        <code className="font-code text-text-light-gray text-s bg-dark-600 px-2 rounded-md">
                                                            {queryParam.type}
                                                        </code>
                                                    </div>
                                                    {queryParam.optional && <div className="text-text-light-gray text-s">Optional</div>}
                                                </div>
                                                <div>{queryParam.description}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {inputModel && (
                            <div className="bg-active-gray p-5 rounded-md">
                                <h3 className="text-xl font-semibold pb-6">
                                    Body <code className="font-code italic text-green-base">&lt;{flow.input}&gt;</code>
                                </h3>
                                <div className="flex flex-col gap-5">
                                    {Object.entries(inputModel.properties || {}).map(([name, propertySchema]) => {
                                        return (
                                            <div key={name} className="flex flex-col pb-5 gap-2.5 border-b border-b-border-gray last-of-type:border-b-0">
                                                <div className="flex justify-between">
                                                    <div className="flex gap-2">
                                                        <code className="font-code text-text-light-gray text-s">{name}</code>
                                                        <code className="font-code text-text-light-gray text-s bg-dark-600 px-2 rounded-md">
                                                            {propertyToTypescriptExample(propertySchema as JSONSchema7)}
                                                        </code>
                                                    </div>
                                                    {!inputModel.required?.includes(name) && <div className="text-text-light-gray text-s">Optional</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {!queryParams && !inputModel && <div className="text-text-light-gray px-5 italic">No parameters or body</div>}
                    </div>
                    <ScriptSettings flow={flow} integration={integration} />
                </div>
                <div className="flex flex-col grow gap-10 w-1/2">
                    <div className="flex flex-col border border-active-gray rounded-md">
                        <header className="flex justify-between items-center bg-active-gray px-4 py-2 rounded-t-md">
                            <div className="text-text-light-gray">Request</div>
                            <div className="flex gap-2 items-center ">
                                <Select defaultValue={language} onValueChange={(v) => setLanguage(v as any)}>
                                    <SelectTrigger className="uppercase text-text-light-gray text-[11px] px-1.5 py-0.5 h-auto">
                                        <SelectValue placeholder="Language" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="node" className="text-s">
                                            Node Client
                                        </SelectItem>
                                        <SelectItem value="curl" className="text-s">
                                            curl
                                        </SelectItem>
                                        <SelectItem value="javascript" className="text-s">
                                            Javascript
                                        </SelectItem>
                                        <SelectItem value="go" className="text-s">
                                            Go
                                        </SelectItem>
                                        <SelectItem value="java" className="text-s">
                                            Java
                                        </SelectItem>
                                        <SelectItem value="python" className="text-s">
                                            Python
                                        </SelectItem>
                                        <SelectItem value="php" className="text-s">
                                            PHP
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <CopyButton text={requestSnippetCopy} />
                            </div>
                        </header>
                        <div>
                            <Prism noCopy language="typescript" className="px-0 py-2 transparent-code" colorScheme="dark">
                                {requestSnippet}
                            </Prism>
                        </div>
                    </div>

                    <div className="flex flex-col border border-active-gray rounded-md">
                        <header className="flex justify-between items-center bg-active-gray px-4 py-2 rounded-t-md">
                            <div className="text-text-light-gray">Response</div>
                            <div className="flex gap-2 items-center ">
                                <Tag variant={'neutral'}>Json</Tag>
                                <CopyButton text={responseSnippet} />
                            </div>
                        </header>
                        <div>
                            <Prism noCopy language="typescript" className="px-0 py-2 transparent-code" colorScheme="dark">
                                {responseSnippet}
                            </Prism>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};
