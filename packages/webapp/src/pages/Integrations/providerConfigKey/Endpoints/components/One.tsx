import { Prism } from '@mantine/prism';
import { HttpLabel } from '../../../../../components/HttpLabel';
import { CopyButton } from '../../../../../components/ui/button/CopyButton';
import { Tag } from '../../../../../components/ui/label/Tag';
import type { NangoSyncConfigWithEndpoint } from './List';
import { useEffect, useMemo, useState } from 'react';
import type { GetIntegration, NangoModel } from '@nangohq/types';
import { fieldToTypescript, getSyncResponse, modelToString } from '../../../../../utils/scripts';
import { httpSnippet, nodeActionSnippet, nodeSyncSnippet } from '../../../../../utils/language-snippets';
import { useStore } from '../../../../../store';
import { useEnvironment } from '../../../../../hooks/useEnvironment';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../../components/ui/Select';
import { ScriptSettings } from './ScriptSettings';
import { Info } from '../../../../../components/Info';
import { useLocalStorage } from 'react-use';

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
    const [openConfiguration, setOpenConfiguration] = useState(false);

    const { environmentAndAccount } = useEnvironment(env);
    const [language, setLanguage] = useLocalStorage<'node' | 'curl' | 'go' | 'javascript' | 'java' | 'php' | 'python'>('nango:snippet:language', 'node');
    const [requestSnippet, setRequestSnippet] = useState('');
    const [responseSnippet, setResponseSnippet] = useState('');

    useEffect(() => {
        const generate = async () => {
            let req = '';
            let res = '';

            const activeEndpointIndex = flow.endpoints.findIndex((endpoint) => {
                return endpoint.method === flow.endpoint.method && endpoint.path === flow.endpoint.path;
            });
            const outputModelName = Array.isArray(flow.returns) ? flow.returns[activeEndpointIndex] : flow.returns;
            // This code is completely valid but webpack is complaining for some obscure reason
            const outputModel = (flow.models as unknown as NangoModel[]).find((m) => m.name === outputModelName);

            const providerConfigKey = integration.integration.unique_key;
            const secretKey = environmentAndAccount!.environment.secret_key;

            // Request
            if (language === 'node') {
                req =
                    flow.type === 'sync'
                        ? nodeSyncSnippet({ modelName: outputModel!.name, secretKey, connectionId, providerConfigKey })
                        : nodeActionSnippet({ actionName: flow.name, secretKey, connectionId, providerConfigKey, input: flow.input });
            } else {
                req = await httpSnippet({
                    baseUrl,
                    endpoint: flow.endpoints[activeEndpointIndex],
                    secretKey,
                    connectionId,
                    providerConfigKey,
                    input: flow.type === 'action' ? flow.input : undefined,
                    language: language === 'curl' ? 'shell' : language!
                });
            }

            // Response
            if (flow.type === 'sync') {
                res = outputModel ? getSyncResponse(outputModel) : 'no response';
            } else {
                res = outputModel ? modelToString(outputModel) : 'no response';
            }

            setRequestSnippet(req);
            setResponseSnippet(res);
        };

        void generate();
    }, [flow, language, baseUrl, environmentAndAccount, integration]);

    const queryParams = useMemo(() => {
        return flow.type === 'sync' ? syncDefaultQueryParams : null;
    }, [flow]);

    const body = useMemo(() => {
        return flow.type === 'action' && flow.input ? flow.input : null;
    }, [flow.input, flow.type]);

    const metadata = useMemo(() => {
        return flow.type === 'sync' && flow.input ? flow.input : null;
    }, [flow.input, flow.type]);

    return (
        <div className="flex flex-col gap-10 text-white text-sm">
            <header className="bg-active-gray flex gap-10 justify-between p-5">
                <div className="flex flex-col gap-5">
                    <h2>
                        <HttpLabel {...flow.endpoint} size="xl" />{' '}
                    </h2>
                    <div>{flow.description}</div>
                </div>
                <div className="flex-shrink-0 content-center">
                    <ScriptSettings flow={flow} integration={integration} open={openConfiguration} setOpen={setOpenConfiguration} />
                </div>
            </header>

            {!flow.enabled && (
                <Info variant="warning">
                    This endpoint is disabled. To enable it, go to{' '}
                    <button onClick={() => setOpenConfiguration(true)} className="underline">
                        Endpoint Configuration
                    </button>
                </Info>
            )}

            <main className="flex gap-10">
                <div className="w-1/2 flex flex-col gap-10">
                    {queryParams && (
                        <div className="bg-active-gray p-5 rounded-md">
                            <h3 className="text-xl font-semibold pb-6">Query Parameters</h3>
                            <div className="flex flex-col gap-5">
                                {queryParams.map((queryParam) => {
                                    return (
                                        <div key={queryParam.name} className="flex flex-col pb-5 gap-2.5 border-b border-b-border-gray last-of-type:border-b-0">
                                            <div className="flex justify-between">
                                                <div className="flex gap-2">
                                                    <code className="font-code text-text-light-gray text-s">{queryParam.name}</code>
                                                    <code className="font-code text-text-light-gray text-s bg-dark-600 px-2 rounded-md">{queryParam.type}</code>
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
                    {metadata && (
                        <div className="bg-active-gray p-5 rounded-sm">
                            <h3 className="text-xl font-semibold pb-6">
                                Metadata{' '}
                                {('isAnon' in metadata && !metadata.isAnon) ||
                                    (!('isAnon' in metadata) && <code className="font-code italic text-green-base">&lt;{metadata.name}&gt;</code>)}
                            </h3>
                            <div className="flex flex-col gap-5">
                                {metadata.fields.map((field) => {
                                    return (
                                        <div key={field.name} className="flex flex-col pb-5 gap-2.5 border-b border-b-border-gray last-of-type:border-b-0">
                                            <div className="flex justify-between">
                                                <div className="flex gap-2">
                                                    <code className="font-code text-text-light-gray text-s">{field.name}</code>
                                                    <code className="font-code text-text-light-gray text-s bg-dark-600 px-2 rounded-md">
                                                        {/* {'value' in field ? (Array.isArray(field.value) ? 'Arr' : field.value) : field.type} */}
                                                        {'value' in field ? fieldToTypescript({ field }) : field.type}
                                                    </code>
                                                </div>
                                                {'optional' in field && field.optional && <div className="text-text-light-gray text-s">Optional</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {body && (
                        <div className="bg-active-gray p-5 rounded-md">
                            <h3 className="text-xl font-semibold pb-6">
                                Body <code className="font-code italic text-green-base">&lt;{body.name}&gt;</code>
                            </h3>
                            <div className="flex flex-col gap-5">
                                {body.fields.map((field) => {
                                    return (
                                        <div key={field.name} className="flex flex-col pb-5 gap-2.5 border-b border-b-border-gray last-of-type:border-b-0">
                                            <div className="flex justify-between">
                                                <div className="flex gap-2">
                                                    <code className="font-code text-text-light-gray text-s">{field.name}</code>
                                                    <code className="font-code text-text-light-gray text-s bg-dark-600 px-2 rounded-md">
                                                        {'value' in field
                                                            ? fieldToTypescript({ field })
                                                            : typeof field.type === 'object'
                                                              ? JSON.stringify(field.type)
                                                              : field.type}
                                                    </code>
                                                </div>
                                                {'optional' in field && field.optional && <div className="text-text-light-gray text-s">Optional</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {!queryParams && !metadata && !body && <div className="text-text-light-gray px-5 italic">No parameters or body</div>}
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
                                <CopyButton text={requestSnippet} />
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
