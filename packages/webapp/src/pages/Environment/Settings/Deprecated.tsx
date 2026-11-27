import { ArrowUpRight, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import {
    Alert,
    AlertActions,
    AlertButton,
    AlertDescription,
    AlertTitle,
    CopyButton,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    SecretInput
} from '@nangohq/design-system';

import { EditableInput } from '@/components/patterns/EditableInput';
import { PERMISSION_DENIED_REASON, PermissionGate } from '@/components/patterns/PermissionGate';
import { Switch } from '@/components/ui/Switch';
import { usePermissions } from '@/hooks/usePermissions';
import { useEnvironment, usePatchEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { SettingsCard, SettingsRow } from './components/SettingsCard';

const MIGRATION_GUIDE_URL = 'https://nango.dev/docs/guides/platform/migrations/migrate-from-public-key';

export const DeprecatedSettings: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environment = data?.environmentAndAccount?.environment;
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);

    const { can } = usePermissions();
    const canReadEnvironmentKey = can('environment:settings:read_secret');
    const canEditEnvironment = can('environment:settings:update');

    const [savingHmac, setSavingHmac] = useState(false);

    if (!environment) {
        return null;
    }

    const onHmacEnabled = async (checked: boolean) => {
        setSavingHmac(true);
        try {
            await patchEnvironmentAsync({ hmac_enabled: checked });
            toast({ title: checked ? 'HMAC required' : 'HMAC no longer required', variant: 'success' });
        } catch {
            toast({ title: 'There was an issue updating the HMAC', variant: 'error' });
        } finally {
            setSavingHmac(false);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <Alert variant="warning">
                <TriangleAlert />
                <AlertTitle>Public key and HMAC are deprecated</AlertTitle>
                <AlertDescription>Move to Connect sessions before they&apos;re removed.</AlertDescription>
                <AlertActions>
                    <AlertButton asChild>
                        <a href={MIGRATION_GUIDE_URL} target="_blank" rel="noopener noreferrer">
                            Migration guide
                            <ArrowUpRight />
                        </a>
                    </AlertButton>
                </AlertActions>
            </Alert>

            <SettingsCard title="Frontend credentials">
                <SettingsRow label="Public key" htmlFor="public_key">
                    {canReadEnvironmentKey ? (
                        <InputGroup>
                            <InputGroupInput id="public_key" mono value={environment.public_key} readOnly />
                            <InputGroupAddon align="inline-end">
                                <CopyButton value={environment.public_key} />
                            </InputGroupAddon>
                        </InputGroup>
                    ) : (
                        <SecretInput id="public_key" value={environment.public_key} canReveal={false} disabledReason={PERMISSION_DENIED_REASON} />
                    )}
                </SettingsRow>
                <SettingsRow label="Require HMAC" htmlFor="hmac_enabled">
                    <div className="flex items-center gap-2 md:pt-1.5">
                        <PermissionGate condition={canEditEnvironment}>
                            {(allowed) => (
                                <Switch
                                    id="hmac_enabled"
                                    checked={environment.hmac_enabled}
                                    onCheckedChange={(checked) => void onHmacEnabled(checked)}
                                    disabled={!allowed || savingHmac}
                                />
                            )}
                        </PermissionGate>
                        <span className="type-text-regular-sm text-text-default" aria-hidden>
                            {environment.hmac_enabled ? 'On' : 'Off'}
                        </span>
                    </div>
                </SettingsRow>
                <SettingsRow label="HMAC key" htmlFor="hmac_key">
                    <EditableInput
                        id="hmac_key"
                        placeholder="*****"
                        secret
                        mono
                        initialValue={environment.hmac_key || ''}
                        onSave={async (value) => {
                            try {
                                await patchEnvironmentAsync({ hmac_key: value });
                                toast({ title: 'HMAC key updated', variant: 'success' });
                            } catch (err) {
                                toast({ title: 'Failed to update HMAC key', variant: 'error' });
                                throw err;
                            }
                        }}
                        canEdit={canEditEnvironment}
                    />
                </SettingsRow>
            </SettingsCard>
        </div>
    );
};
