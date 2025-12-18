import { IconExternalLink } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { EditableInput } from './components/EditableInput';
import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import Spinner from '../../../components/ui/Spinner';
import SecretInput from '../../../components/ui/input/SecretInput';
import { apiPatchEnvironment, useEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { Switch } from '@/components-v2/ui/switch';

export const DeprecatedSettings: React.FC = () => {
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
    };

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <SettingsContent title="Deprecated authorization">
            <SettingsGroup
                label={
                    <div className="flex gap-1.5">
                        Public key
                        <Link
                            className="flex gap-2 items-center"
                            target="_blank"
                            to="https://nango.dev/docs/implementation-guides/migrations/migrate-from-public-key"
                        >
                            <IconExternalLink stroke={1} size={18} />
                        </Link>
                    </div>
                }
            >
                <fieldset className="flex flex-col gap-4">
                    <SecretInput
                        inputSize={'lg'}
                        view={false}
                        copy={true}
                        variant={'black'}
                        name="publicKey"
                        value={environmentAndAccount.environment.public_key}
                    />
                </fieldset>
            </SettingsGroup>
            <SettingsGroup
                label={
                    <div className="flex gap-1.5">
                        HMAC
                        <Link
                            className="flex gap-2 items-center"
                            target="_blank"
                            to="https://nango.dev/docs/implementation-guides/migrations/migrate-from-public-key"
                        >
                            <IconExternalLink stroke={1} size={18} />
                        </Link>
                    </div>
                }
            >
                <div className="flex flex-col gap-7">
                    <div className="flex items-start justify-between">
                        <label htmlFor={'hmac_enabled'} className={`text-sm`}>
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
            </SettingsGroup>
        </SettingsContent>
    );
};
