import { CheckCircleIcon } from '@heroicons/react/24/outline';
import Button from '../../components/ui/button/Button';
import { Bloc } from './Bloc';
import { Steps } from './utils';

export const DeployBloc: React.FC<{ step: Steps; onProgress: () => void }> = ({ step, onProgress }) => {
    const onDeploy = () => {
        onProgress();
    };

    return (
        <Bloc
            title="Deploy an integration"
            subtitle={<>The following script will sync GitHub issues (from this showcase repo) to Nango. Scripts run on Nango&apos;s architecture.</>}
            active={step === Steps.Authorize}
            done={step >= Steps.Deploy}
        >
            <div className="border bg-zinc-900 border-zinc-800 rounded-lg text-white text-sm">
                <div className="px-5 py-4 bg-zinc-900 rounded-lg">
                    {step === Steps.Authorize ? (
                        <Button type="button" variant="primary" onClick={onDeploy}>
                            <img className="h-5" src="/images/unlock-icon.svg" alt="" />
                            Deploy GitHub integration
                        </Button>
                    ) : (
                        <span className="mx-2 text-emerald-300 text-sm flex items-center h-9 gap-2">
                            <CheckCircleIcon className="h-5 w-5" />
                            GitHub-to-Nango syncing enabled!
                        </span>
                    )}
                </div>
            </div>
        </Bloc>
    );
};
