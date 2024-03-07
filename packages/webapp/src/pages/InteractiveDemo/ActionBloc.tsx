import { Prism } from '@mantine/prism';
import { Steps } from './utils';
import Button from '../../components/ui/button/Button';
import { useMemo } from 'react';
import { Bloc } from './Bloc';

export const ActionBloc: React.FC<{ step: Steps; providerConfigKey: string; connectionId: string; onProgress: () => void }> = ({
    step,
    providerConfigKey,
    connectionId,
    onProgress
}) => {
    const actionSnippet = useMemo(() => {
        return `nango.triggerAction('${providerConfigKey}', '${connectionId}', 'create_issue', params);`;
    }, [providerConfigKey, connectionId]);

    return (
        <Bloc
            title="Write back or perform workflows"
            subtitle={<>Create a sample GitHub issue from your backend, via Nango.</>}
            active={step === Steps.Write}
            done={step >= Steps.Write}
            noTrack
        >
            <div className="border border-border-gray rounded-md text-white text-sm py-2 mb-5">
                <Prism language="typescript" colorScheme="dark" noCopy className="transparent-code">
                    {actionSnippet}
                </Prism>
            </div>
            {step === Steps.Write && (
                <Button variant="primary" onClick={onProgress}>
                    Got it!
                </Button>
            )}
        </Bloc>
    );
};

{
    /* <div className="mt-8 ml-6">
<div className={`p-4 rounded-md relative ${step > Steps.Write ? 'border border-green-900 bg-gradient-to-r from-[#0C1E1A] to-[#0E1115]' : ''}`}>
    <div className="absolute left-[-2.22rem] top-4 w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center">
        <div className={`w-2 h-2 rounded-full ring-1 ${step > Steps.Write ? 'ring-[#318463]' : 'ring-white'} bg-transparent`}></div>
    </div>
    <h2 className={`text-xl${step < Steps.Write ? ' text-text-light-gray' : ''}`}>Write back to APIs</h2>
    {step >= Steps.Write && (
        <>
            <h3 className="text-text-light-gray mb-6">Push updates back to external APIs, with unified & customizable schemas across APIs.</h3>
            <div className="border border-border-gray rounded-md text-white text-sm py-2 mb-5">
                <Prism language="typescript" colorScheme="dark" noCopy className="transparent-code">
                    {actionSnippet}
                </Prism>
            </div>
            {step === Steps.Write && (
                <Button variant="primary" onClick={onProgress}>
                    Got it!
                </Button>
            )}
        </>
    )}
</div>
</div> */
}
