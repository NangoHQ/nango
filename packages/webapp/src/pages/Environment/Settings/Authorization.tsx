import SecretInput from '../../../components/ui/input/SecretInput';
import { useStore } from '../../../store';
import { apiPatchEnvironment, useEnvironment } from '../../../hooks/useEnvironment';
import { EditableInput } from './EditableInput';

import { useToast } from '../../../hooks/useToast';
import { Switch } from '../../../components/ui/Switch';
import { useState } from 'react';
import Spinner from '../../../components/ui/Spinner';
import { IconExternalLink } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

export const AuthorizationSettings: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { environmentAndAccount, mutate } = useEnvironment(env);

    const [loading, setLoading] = useState(false);

    const onHmacEnabled = async (isChecked: boolean) => {
        setLoading(true);
        const res = await apiPatchEnvironment(env, {
            hmac_enabled: isChecked
        });
        setLoading(false);

        if ('error' in res.json) {
            toast({ title: 'There was an issue updating the HMAC', variant: 'error' });
            return;
        }

        void mutate();

        toast({ title: 'HMAC updated successfully!', variant: 'error' });
    };

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <div className="text-grayscale-100 flex flex-col gap-10">
            <div className="px-8 flex flex-col gap-10 w-3/5">
                <fieldset className="flex flex-col gap-4">
                    <Link to="https://docs.nango.dev/guides/api-authorization/public-key-deprecation" className="flex gap-2 items-center" target="_blank">
                        <label htmlFor="publicKey" className="font-semibold">
                            Public Key
                        </label>
                        <IconExternalLink stroke={1} size={18} />
                    </Link>
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
                    <Link to="https://docs.nango.dev/guides/api-authorization/public-key-deprecation" className="flex gap-2 items-center" target="_blank">
                        <label htmlFor="hmac_enabled" className="font-semibold">
                            HMAC
                        </label>
                        <IconExternalLink stroke={1} size={18} />
                    </Link>

                    <div className="flex items-center justify-between">
                        <label htmlFor={'hmac_enabled'} className={`text-s`}>
                            Enabled
                        </label>
                        <div className="flex gap-2 items-center">
                            {loading && <Spinner size={1} />}
                            <Switch
                                name="hmac_enabled"
                                checked={environmentAndAccount.environment.hmac_enabled}
                                onCheckedChange={(checked) => onHmacEnabled(!!checked)}
                            />
                        </div>
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
