import { IconServer } from '@tabler/icons-react';
import SecretInput from '../../../components/ui/input/SecretInput';
import { useStore } from '../../../store';
import { useEnvironment } from '../../../hooks/useEnvironment';

export const AuthorizationSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <div className="text-grayscale-100 flex flex-col gap-10">
            <div className="flex gap-2 items-center rounded-md bg-grayscale-900 px-8 h-10">
                <div>
                    <IconServer stroke={1} size={18} />
                </div>
                <h3 className="uppercase text-sm">Authorization Settings</h3>
            </div>
            <div className="px-8 flex flex-col gap-10 w-3/5">
                <fieldset className="flex flex-col gap-4">
                    <label htmlFor="publicKey" className="font-semibold">
                        Public Key
                    </label>
                    <SecretInput inputSize={'lg'} copy={true} variant={'black'} name="publicKey" value={environmentAndAccount.environment.public_key} />
                </fieldset>

                <fieldset className="flex flex-col gap-4">
                    <label htmlFor="hmac" className="font-semibold">
                        HMAC Key
                    </label>
                    <SecretInput inputSize={'lg'} copy={true} variant={'black'} name="hmac" value={environmentAndAccount.environment.hmac_key || ''} />
                </fieldset>
            </div>
        </div>
    );
};
