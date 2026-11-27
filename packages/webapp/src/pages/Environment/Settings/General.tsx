import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    Alert,
    AlertDescription,
    CopyButton,
    Field,
    FieldError,
    InlineCode,
    Input,
    InputGroup,
    InputGroupAddon,
    InputGroupInput
} from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { DocsIconLink } from '@/components/patterns/DocsIconLink';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { Switch } from '@/components/ui/Switch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { PROD_ENVIRONMENT_NAME } from '@/utils/environments';
import { useDeleteEnvironment, useEnvironment, usePatchEnvironment } from '../../../hooks/useEnvironment';
import { useMeta } from '../../../hooks/useMeta';
import { useStore } from '../../../store';
import { DeleteButton } from './components/DeleteButton';
import { SettingsCard, SettingsRow } from './components/SettingsCard';
import { apiErrorMessage, ENV_NAME_PATTERN, secretKeyEnvVar } from './utils';

export const General: React.FC = () => {
    const navigate = useNavigate();

    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();

    const { refetch: refetchMeta } = useMeta();
    const { data } = useEnvironment(env);
    const environment = data?.environmentAndAccount?.environment;
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);
    const { mutateAsync: deleteEnvironmentAsync } = useDeleteEnvironment(env);

    const { can } = usePermissions();
    const canEditEnvironment = can('environment:settings:update');
    const canToggleIsProduction = can('account:environments:set_production');
    const canDeleteEnvironment = can('environment:delete');

    const isProdEnv = env === PROD_ENVIRONMENT_NAME;
    const [name, setName] = useState(env);
    const [saving, setSaving] = useState(false);
    const [showDeleteAlert, setShowDeleteAlert] = useState(false);

    const nameError = ENV_NAME_PATTERN.test(name) ? null : 'Use lowercase letters, numbers, underscores or hyphens.';
    const nameDirty = name !== env;

    const saveName = async () => {
        setSaving(true);
        try {
            await patchEnvironmentAsync({ name });
            navigate(`/${name}/environment-settings`);
            await refetchMeta();
            setEnv(name);
            toast({ title: 'Environment renamed', variant: 'success' });
        } catch (err) {
            toast({ title: apiErrorMessage(err, 'Failed to rename environment'), variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            await deleteEnvironmentAsync();
            setShowDeleteAlert(false);
            await navigate(`/${PROD_ENVIRONMENT_NAME}/environment-settings`, { replace: true });
            await refetchMeta();
            setEnv(PROD_ENVIRONMENT_NAME);
        } catch {
            toast({ title: 'Failed to delete environment', variant: 'error' });
        }
    };

    const onProductionChange = (checked: boolean) =>
        confirm({
            title: checked ? 'Upgrade to production environment' : 'Downgrade to non-production environment',
            description: 'This impacts which team members have access to this environment.',
            onConfirm: async () => {
                await patchEnvironmentAsync({ is_production: checked });
                await refetchMeta();
                toast({
                    title: `Successfully ${checked ? 'upgraded' : 'downgraded'} to ${checked ? 'production' : 'non-production'} environment`,
                    variant: 'success'
                });
            },
            confirmButtonText: checked ? 'Upgrade' : 'Downgrade',
            confirmVariant: 'danger',
            docs: {
                title: 'Learn more',
                url: 'https://nango.dev/docs/guides/platform/environments#production-environments'
            }
        });

    return (
        <div className="flex flex-col gap-5">
            <SettingsCard
                title="Environment"
                dirty={nameDirty}
                invalid={!!nameError}
                saving={saving}
                canEdit={canEditEnvironment}
                onSave={saveName}
                onDiscard={() => setName(env)}
            >
                <SettingsRow label="Name" htmlFor="env-name">
                    <ConditionalTooltip condition={isProdEnv} content={`You cannot rename the ${PROD_ENVIRONMENT_NAME} environment`} asChild>
                        <div>
                            <Field data-invalid={!!nameError}>
                                <Input
                                    id="env-name"
                                    mono
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    disabled={isProdEnv || !canEditEnvironment}
                                    aria-invalid={!!nameError}
                                    spellCheck={false}
                                    autoComplete="off"
                                />
                                {nameError && <FieldError>{nameError}</FieldError>}
                            </Field>
                        </div>
                    </ConditionalTooltip>
                    {nameDirty && !nameError && (
                        <Alert variant="warning">
                            <TriangleAlert />
                            <AlertDescription>
                                <span>
                                    Your key variable becomes <InlineCode>{secretKeyEnvVar(name)}</InlineCode>. Update your <InlineCode>.env</InlineCode> files.
                                </span>
                            </AlertDescription>
                        </Alert>
                    )}
                </SettingsRow>

                <SettingsRow label="Environment ID" htmlFor="env-id">
                    <InputGroup>
                        <InputGroupInput id="env-id" mono value={environment?.uuid ?? ''} readOnly />
                        <InputGroupAddon align="inline-end">
                            <CopyButton value={environment?.uuid ?? ''} />
                        </InputGroupAddon>
                    </InputGroup>
                </SettingsRow>

                <SettingsRow
                    label={
                        <span className="inline-flex items-center gap-1.5">
                            Production
                            <DocsIconLink
                                href="https://nango.dev/docs/guides/platform/environments#production-environments"
                                label="Production environments documentation"
                            />
                        </span>
                    }
                    description="Limits what non-admin roles can see and change."
                >
                    <div className="flex items-center gap-2 md:pt-1.5">
                        <ConditionalTooltip
                            condition={isProdEnv}
                            content={`You cannot change the production status of the ${PROD_ENVIRONMENT_NAME} environment`}
                        >
                            <PermissionGate condition={canToggleIsProduction}>
                                {(allowed) => (
                                    <Switch
                                        aria-label="Production environment"
                                        disabled={isProdEnv || !allowed}
                                        checked={environment?.is_production}
                                        onCheckedChange={onProductionChange}
                                    />
                                )}
                            </PermissionGate>
                        </ConditionalTooltip>
                        <span className="type-text-regular-sm text-text-default" aria-hidden>
                            {environment?.is_production ? 'On' : 'Off'}
                        </span>
                    </div>
                </SettingsRow>
            </SettingsCard>

            {canDeleteEnvironment && (
                <SettingsCard title="Danger zone" variant="danger">
                    <SettingsRow label="Delete environment">
                        <div>
                            <DeleteButton
                                environmentName={env}
                                onDelete={handleDelete}
                                open={showDeleteAlert}
                                onOpenChange={setShowDeleteAlert}
                                disabled={isProdEnv ? `You cannot delete the ${PROD_ENVIRONMENT_NAME} environment` : false}
                            />
                        </div>
                    </SettingsRow>
                </SettingsCard>
            )}

            {DialogComponent}
        </div>
    );
};
