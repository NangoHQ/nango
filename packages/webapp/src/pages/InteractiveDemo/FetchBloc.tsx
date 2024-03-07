import { Language, Steps, endpoint, model } from './utils';
import Button from '../../components/ui/button/Button';
import { useMemo, useState } from 'react';
import { curlSnippet, nodeSnippet } from '../../utils/language-snippets';
import { useStore } from '../../store';
import CopyButton from '../../components/ui/button/CopyButton';
import { Prism } from '@mantine/prism';
import Info from '../../components/ui/Info';
import { Modal, useModal } from '@geist-ui/core';
import Spinner from '../../components/ui/Spinner';
import { Bloc, Tab } from './Bloc';
import { cn } from '../../utils/utils';

export const FetchBloc: React.FC<{
    step: Steps;
    providerConfigKey: string;
    connectionId: string;
    secretKey: string;
    records: Record<string, unknown>[];
    syncStillRunning: boolean;
    onProgress: () => Promise<void> | void;
}> = ({ step, connectionId, providerConfigKey, secretKey, records, syncStillRunning, onProgress }) => {
    const [language, setLanguage] = useState<Language>(Language.Node);
    const [error] = useState<string | null>(null);

    const baseUrl = useStore((state) => state.baseUrl);
    const { setVisible, bindings } = useModal();

    const snippet = useMemo<string>(() => {
        if (language === Language.Node) {
            return nodeSnippet(model, secretKey, connectionId, providerConfigKey);
        } else if (language === Language.cURL) {
            return curlSnippet(baseUrl, endpoint, secretKey, connectionId, providerConfigKey);
        }
        return '';
    }, [language, baseUrl, secretKey, connectionId, providerConfigKey]);

    return (
        <Bloc
            title="Fetch the new data"
            subtitle={<>Fetch sample GitHub issues in your backend, via Nango.</>}
            active={step === Steps.Webhooks}
            done={step >= Steps.Fetch}
        >
            <>
                <Modal {...bindings} wrapClassName="!h-[600px] !w-[550px] !max-w-[550px] !bg-black no-border-modal">
                    <div className="flex justify-between text-sm">
                        <div>
                            <Info size={24}>
                                <span className="text-left">Object schemas are customizable, and should be unified across APIs.</span>
                            </Info>
                            <Modal.Content className="overflow-scroll max-w-[550px]">
                                <Prism language="json" colorScheme="dark" className="!text-sm !max-h-[400px] max-w-[550px] break-all-words !pb-6" noCopy>
                                    {JSON.stringify(records, null, 2)}
                                </Prism>
                            </Modal.Content>
                        </div>
                    </div>
                    <Modal.Action
                        placeholder={null}
                        passive
                        className="!flex !justify-end !text-sm !bg-black !border-0 !h-[100px]"
                        onClick={() => setVisible(false)}
                    >
                        <Button className="!text-text-light-gray" variant="zombieGray">
                            Close
                        </Button>
                    </Modal.Action>
                </Modal>
                <div className="border bg-zinc-900 border-zinc-800 rounded-lg text-white text-sm">
                    <div className="flex justify-between items-center px-5 py-4 bg-zinc-900 rounded-lg">
                        <div className="space-x-4">
                            <Tab
                                variant={language === Language.Node ? 'black' : 'zombie'}
                                className={cn('cursor-default', language !== Language.Node && 'cursor-pointer bg-zinc-900 pointer-events-auto')}
                                onClick={() => {
                                    if (language !== Language.Node) {
                                        setLanguage(Language.Node);
                                    }
                                }}
                            >
                                Node
                            </Tab>
                            <Tab
                                variant={language === Language.cURL ? 'black' : 'zombie'}
                                className={cn('cursor-default', language !== Language.cURL && 'cursor-pointer bg-zinc-900 pointer-events-auto')}
                                onClick={() => {
                                    if (language !== Language.cURL) {
                                        setLanguage(Language.cURL);
                                    }
                                }}
                            >
                                cURL
                            </Tab>
                        </div>
                        <CopyButton dark text={snippet} />
                    </div>
                    <Prism noCopy language="typescript" className="p-3 transparent-code bg-black" colorScheme="dark">
                        {snippet}
                    </Prism>
                    <div className="flex items-center px-4 py-4">
                        {step >= Steps.Authorize ? (
                            <Button type="button" variant="primary" onClick={onProgress}>
                                <img className="h-5" src="/images/chart-icon.svg" alt="" />
                                Retrieve GitHub Issues
                            </Button>
                        ) : (
                            <>
                                {syncStillRunning ? (
                                    <div className="flex items-center">
                                        <Spinner size={1} />
                                        <span className="ml-2">Please wait while &ldquo;Issues&rdquo; are being fetched</span>
                                    </div>
                                ) : (
                                    <>
                                        <span className="mx-2 text-[#34A853] mr-4 mt-2">
                                            🎉 {records.length >= 15 ? '15+' : records.length} issues retrieved!
                                        </span>
                                        <Button variant="zombieGray" className="mt-2" onClick={() => setVisible(true)}>
                                            Show Data
                                        </Button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                    {error && <p className="mt-2 mx-4 text-sm text-red-600">{error}</p>}
                </div>
            </>
        </Bloc>
    );
};
