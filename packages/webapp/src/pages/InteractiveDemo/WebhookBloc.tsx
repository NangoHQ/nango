import { Steps, model } from './utils';
import Button from '../../components/ui/button/Button';
import { Prism } from '@mantine/prism';
import { useMemo } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { Bloc } from './Bloc';

export const WebhookBloc: React.FC<{ step: Steps; records: Record<string, unknown>[]; onProgress: () => void }> = ({ step, records, onProgress }) => {
    const date = useMemo(() => {
        // We want a fixed date
        return new Date().toISOString();
    }, []);

    const snippet = useMemo(() => {
        return `{
    "connectionId": "<user-email-prefix>", # ID of the user who authorized GitHub.
    "model": "${model}", # Schema of the synced data.
    "providerConfigKey": "github-demo", # ID for the integration settings.
    "responseResults": { "issue": { "added": ${records.length} } }, # Summary of changes.
    "modifiedAfter": "${date}" # Start time for the reported changes.
}`;
    }, [records, date]);

    return (
        <Bloc
            title="Receive webhooks when new data is available"
            subtitle={<>Receive webhooks from Nango when GitHub issues are modified, so you don&apos;t need to poll periodically.</>}
            active={step === Steps.Deploy}
            done={step >= Steps.Webhooks}
        >
            <div className="border bg-zinc-900 border-zinc-800 rounded-lg text-white text-sm">
                <Prism language="json" colorScheme="dark" noCopy className="transparent-code bg-black rounded-t-lg p-3">
                    {snippet}
                </Prism>
                <div className="px-5 py-4 bg-zinc-900 rounded-lg">
                    {step === Steps.Deploy ? (
                        <Button variant="primary" onClick={onProgress}>
                            Got it!
                        </Button>
                    ) : (
                        <span className="mx-2 text-emerald-300 text-sm flex items-center h-9 gap-2">
                            <CheckCircleIcon className="h-5 w-5" />
                            Done!
                        </span>
                    )}
                </div>
            </div>
        </Bloc>
    );
};
