import SecretInput from '../../../components/ui/input/SecretInput';
import { useStore } from '../../../store';
import { apiPatchEnvironment, useEnvironment } from '../../../hooks/useEnvironment';
import { EditableInput } from './EditableInput';

import { useToast } from '../../../hooks/useToast';
import { Switch } from '../../../components/ui/Switch';

export const AuthorizationSettings: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { environmentAndAccount, mutate } = useEnvironment(env);

    const onHmacEnabled = async (isChecked: boolean) => {
        const res = await apiPatchEnvironment(env, {
            hmac_enabled: isChecked
        });

        if ('error' in res.json) {
            toast({ title: 'There was an issue updating the HMAC', variant: 'error' });
            return;
        }

        void mutate();

        toast({ title: 'HMAC updated successfully!', variant: 'success' });
    };

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <div className="text-grayscale-100 flex flex-col gap-10">
            <div className="px-8 flex flex-col gap-10 w-3/5">
                <fieldset className="flex flex-col">
                    <label htmlFor="publicKey" className="font-semibold mb-4">
                        Public Key
                    </label>
                    <SecretInput
                        inputSize={'lg'}
                        view={false}
                        copy={true}
                        variant={'black'}
                        name="publicKey"
                        value={environmentAndAccount.environment.public_key}
                    />
                </fieldset>

                <div className="flex flex-col gap-4">
                    <label htmlFor="publicKey" className="font-semibold">
                        HMAC
                    </label>

                    <div className="flex items-center justify-between">
                        <label htmlFor={'hmac_enabled'} className={`text-s`}>
                            Enabled
                        </label>
                        <Switch
                            name="hmac_enabled"
                            checked={environmentAndAccount.environment.hmac_enabled}
                            onCheckedChange={(checked) => onHmacEnabled(!!checked)}
                        />
                    </div>

                    <EditableInput
                        name="hmac_key"
                        title="HMAC Key"
                        placeholder="*****"
                        subTitle
                        secret
                        originalValue={environmentAndAccount.environment.hmac_key || ''}
                        apiCall={(value) => apiPatchEnvironment(env, { hmac_key: value })}
                        onSuccess={() => void mutate()}
                    />
                </div>
            </div>
        </div>
    );
};
