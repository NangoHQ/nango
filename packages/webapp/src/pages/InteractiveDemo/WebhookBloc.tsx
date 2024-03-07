import { Steps, model } from './utils';
import Button from '../../components/ui/button/Button';
import { Prism } from '@mantine/prism';
import { useMemo } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { Bloc } from './Bloc';

export const WebhookBloc: React.FC<{ step: Steps; records: Record<string, unknown>[]; onProgress: () => void }> = ({ step, records, onProgress }) => {
    const webhookSnippet = useMemo(() => {
        return `{ "${model}": { "added": ${records.length}, "updated": 0, "deleted": 0 }, ...}`;
    }, [records]);

    return (
        <Bloc
            title="Receive webhooks when new data is available"
            subtitle={<>Receive webhooks from Nango when GitHub issues are modified, so you don&apos;t need to poll periodically.</>}
            active={step === Steps.Deploy}
            done={step >= Steps.Webhooks}
        >
            <div className="border border-border-gray rounded-md text-white text-sm py-2 mb-5">
                <Prism language="json" colorScheme="dark" noCopy className="transparent-code">
                    {webhookSnippet}
                </Prism>
            </div>
            {step === Steps.Webhooks ? (
                <Button variant="primary" onClick={onProgress}>
                    Got it!
                </Button>
            ) : (
                <span className="mx-2 text-emerald-300 text-sm flex items-center h-9 gap-2">
                    <CheckCircleIcon className="h-5 w-5" />
                    Done!
                </span>
            )}
        </Bloc>
    );
};

{
    /* <div className="mt-8 ml-6">
            <div className={`p-4 rounded-md relative ${step > Steps.Receive ? 'border border-green-900 bg-gradient-to-r from-[#0C1E1A] to-[#0E1115]' : ''}`}>
                <div className="absolute left-[-2.22rem] top-4 w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center">
                    <div className={`w-2 h-2 rounded-full ring-1 ${step > Steps.Receive ? 'ring-[#318463]' : 'ring-white'} bg-transparent`}></div>
                </div>
                <h2 className={`text-xl${step < Steps.Receive ? ' text-text-light-gray' : ''}`}>Receive webhooks when new data is available</h2>
                {step >= Steps.Receive && (
                    <>
                        <h3 className="text-text-light-gray mb-6">Receive webhooks on data updates, so you don’t need poll periodically.</h3>
                        <div className="border border-border-gray rounded-md text-white text-sm py-2 mb-5">
                            <Prism language="json" colorScheme="dark" noCopy className="transparent-code">
                                {webhookSnippet}
                            </Prism>
                        </div>
                        {step === Steps.Receive && (
                            <Button variant="primary" onClick={onProgress}>
                                Got it!
                            </Button>
                        )}
                    </>
                )}
            </div>
        </div> */
}
