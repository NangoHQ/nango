import { Prism } from '@mantine/prism';
import { HttpLabel } from '../../../../../components/HttpLabel';
import { CopyButton } from '../../../../../components/ui/button/CopyButton';
import { Tag } from '../../../../../components/ui/label/Tag';
import type { NangoSyncConfigWithEndpoint } from './List';
import { useMemo, useState } from 'react';
import type { GetIntegration, NangoModel } from '@nangohq/types';
import { getSyncResponse, modelToString } from '../../../../../utils/scripts';
import { curlSnippet, nodeActionSnippet, nodeSyncSnippet } from '../../../../../utils/language-snippets';
import { useStore } from '../../../../../store';
import { useEnvironment } from '../../../../../hooks/useEnvironment';

const connectionId = '<CONNECTION_ID>';
export const EndpointOne: React.FC<{ integration: GetIntegration['Success']['data']; flow: NangoSyncConfigWithEndpoint }> = ({ integration, flow }) => {
    const env = useStore((state) => state.env);
    const baseUrl = useStore((state) => state.baseUrl);

    const { environmentAndAccount } = useEnvironment(env);

    const [language, setLanguage] = useState<'Node'>('Node');

    const [requestSnippet, responseSnippet] = useMemo(() => {
        let req = '';
        let res = '';

        const activeEndpointIndex = flow.endpoints.findIndex((endpoint) => {
            const obj = Object.entries(endpoint)[0];
            return obj[0] === flow.endpoint.verb && obj[1] === flow.endpoint.path;
        });
        const outputModelName = flow.returns[activeEndpointIndex];
        // This code is completely valid but webpack is complaining for some obscure reason
        const outputModel = (flow.models as unknown as NangoModel[]).find((m) => m.name === outputModelName);

        const providerConfigKey = integration.integration.unique_key;
        const secretKey = environmentAndAccount!.environment.secret_key;

        if (language === 'Node') {
            req =
                flow.type === 'sync'
                    ? nodeSyncSnippet({ modelName: outputModel!.name, secretKey, connectionId, providerConfigKey })
                    : nodeActionSnippet({ actionName: flow.name, secretKey, connectionId, providerConfigKey, input: flow.input });
        } else {
            req = curlSnippet(baseUrl, flow.endpoints[activeEndpointIndex], secretKey, providerConfigKey, flow.input);
        }

        if (flow.type === 'sync') {
            res = outputModel ? getSyncResponse(outputModel) : 'no response';
        } else {
            res = outputModel ? modelToString(outputModel) : 'no response';
        }

        return [req, res];
    }, [flow, language, baseUrl, environmentAndAccount]);

    return (
        <div className="flex flex-col gap-10 text-white text-sm">
            <header className="bg-active-gray flex gap-2 justify-between p-5">
                <div className="flex flex-col gap-3">
                    <h2>
                        <HttpLabel {...flow.endpoint} size="xl" />{' '}
                    </h2>
                    <div>{flow.description}</div>
                </div>
            </header>

            <main className="flex gap-10">
                <div className="bg-active-gray p-5 w-1/2">
                    <h3 className="text-xl font-semibold">Query & Path Parameters</h3>
                </div>
                <div className="flex flex-col grow gap-10 w-1/2">
                    <div className="flex flex-col border border-active-gray">
                        <header className="flex justify-between items-center bg-active-gray px-4 py-2 rounded-t-lg">
                            <div className="text-text-light-gray">Request</div>
                            <div className="flex gap-2 items-center ">
                                <Tag bgClassName="bg-dark-600">Typescript</Tag>
                                <CopyButton text={requestSnippet} />
                            </div>
                        </header>
                        <div>
                            <Prism noCopy language="typescript" className="p-3 transparent-code" colorScheme="dark">
                                {requestSnippet}
                            </Prism>
                        </div>
                    </div>
                    <div className="flex flex-col border border-active-gray">
                        <header className="flex justify-between items-center bg-active-gray px-4 py-2 rounded-t-lg">
                            <div className="text-text-light-gray">Response</div>
                            <div className="flex gap-2 items-center ">
                                <Tag bgClassName="bg-dark-600">Json</Tag>
                                <CopyButton text={responseSnippet} />
                            </div>
                        </header>
                        <div>
                            <Prism noCopy language="json" className="p-3 transparent-code" colorScheme="dark">
                                {responseSnippet}
                            </Prism>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};
