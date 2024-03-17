import { Steps, model } from './utils';
import Button from '../../components/ui/button/Button';
import { Prism } from '@mantine/prism';
import { useMemo } from 'react';
import { Bloc } from './Bloc';
import { CheckCircledIcon } from '@radix-ui/react-icons';

export const WebhookBloc: React.FC<{ step: Steps; connectionId: string; records: Record<string, unknown>[]; onProgress: () => void }> = ({
    step,
    connectionId,
    records,
    onProgress
}) => {
    const date = useMemo(() => {
        // We want a fixed date
        return new Date().toISOString();
    }, []);

    const snippet = useMemo(() => {
        return `{
    "connectionId": "${connectionId}",
    "model": "${model}",
    "providerConfigKey": "github-demo",
    "responseResults": { "issue": { "added": ${records.length || 3} } },
    "modifiedAfter": "${date}"
}`;
    }, [connectionId, records, date]);

    return (
        <Bloc
            title="Receive webhooks when new data is available"
            subtitle={<>Receive webhooks from Nango when GitHub issues are modified, so you don&apos;t need to poll periodically.</>}
            active={step === Steps.Deploy}
            done={step >= Steps.Webhooks}
        >
            <div className="border bg-zinc-900 border-zinc-900 rounded-lg text-white text-sm">
                <Prism language="json" colorScheme="dark" noCopy className="transparent-code bg-black rounded-t-lg p-3">
                    {snippet}
                </Prism>
                <div className="px-6 py-4 bg-zinc-900 rounded-lg">
                    {step === Steps.Deploy ? (
                        <Button variant="primary" onClick={onProgress}>
                            Got it!
                        </Button>
                    ) : (
                        <span className="text-emerald-300 text-sm flex items-center h-9 gap-2">
                            <CheckCircledIcon className="h-5 w-5" />
                            Done!
                        </span>
                    )}
                </div>
            </div>
        </Bloc>
    );
};
