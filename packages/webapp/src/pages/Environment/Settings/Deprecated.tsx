import { ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { permissions } from '@nangohq/authz';

import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import Spinner from '../../../components/ui/Spinner';
import { useEnvironment, usePatchEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { EditableInput } from '@/components-v2/EditableInput';
import { PermissionGate } from '@/components-v2/PermissionGate';
import { SecretInput } from '@/components-v2/SecretInput';
import { ButtonLink } from '@/components-v2/ui/button';
import { Label } from '@/components-v2/ui/label';
import { Switch } from '@/components-v2/ui/switch';
import { usePermissions } from '@/hooks/usePermissions';

export const DeprecatedSettings: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const environment = environmentAndAccount?.environment;
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);

    const { can } = usePermissions();
    const canReadEnvironmentKey = can(permissions.canReadProdSecretKey) || !environment?.is_production;
    const canEditEnvironment = can(permissions.canWriteProdEnvironment) || !environment?.is_production;

    const [loading, setLoading] = useState(false);

    const onHmacEnabled = async (isChecked: boolean) => {
        setLoading(true);
        try {
            await patchEnvironmentAsync({ hmac_enabled: isChecked });
        } catch {
            toast({ title: 'There was an issue updating the HMAC', variant: 'error' });
        } finally {
            setLoading(false);
        }
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
                        <ButtonLink target="_blank" to="https://nango.dev/docs/guides/platform/migrations/migrate-from-public-key" variant="ghost" size="icon">
                            <ExternalLink />
                        </ButtonLink>
                    </div>
                }
            >
                <fieldset className="flex flex-col gap-4">
                    <SecretInput copy name="publicKey" value={environmentAndAccount.environment.public_key} canRead={canReadEnvironmentKey} disabled />
                </fieldset>
            </SettingsGroup>
            <SettingsGroup
                label={
                    <div className="flex gap-1.5">
                        HMAC
                        <ButtonLink target="_blank" to="https://nango.dev/docs/guides/platform/migrations/migrate-from-public-key" variant="ghost" size="icon">
                            <ExternalLink />
                        </ButtonLink>
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
                            <PermissionGate condition={canEditEnvironment}>
                                {(allowed) => (
                                    <Switch
                                        name="hmac_enabled"
                                        checked={environmentAndAccount.environment.hmac_enabled}
                                        onCheckedChange={(checked) => onHmacEnabled(!!checked)}
                                        disabled={!allowed}
                                    />
                                )}
                            </PermissionGate>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="hmac_key">HMAC key</Label>
                        <EditableInput
                            id="hmac_key"
                            placeholder="*****"
                            secret
                            initialValue={environmentAndAccount.environment.hmac_key || ''}
                            onSave={async (value) => {
                                try {
                                    await patchEnvironmentAsync({ hmac_key: value });
                                    toast({ title: 'Successfully updated', variant: 'success' });
                                } catch (err) {
                                    toast({ title: 'Failed to update', variant: 'error' });
                                    throw err;
                                }
                            }}
                            canEdit={canEditEnvironment}
                        />
                    </div>
                </div>
            </SettingsGroup>
        </SettingsContent>
    );
};
