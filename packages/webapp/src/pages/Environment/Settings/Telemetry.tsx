import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

import { permissions } from '@nangohq/authz';

import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import { useEnvironment, usePatchEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { APIError } from '../../../utils/api';
import { EditableInput } from '@/components-v2/EditableInput';
import { KeyValueInput } from '@/components-v2/KeyValueInput';
import { PermissionGate } from '@/components-v2/PermissionGate';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { Label } from '@/components-v2/ui/label';
import { usePermissions } from '@/hooks/usePermissions';

export const Telemetry: React.FC = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const environment = environmentAndAccount?.environment;
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);

    const { can } = usePermissions();
    const canEditEnvironment = can(permissions.canWriteProdEnvironment) || !environment?.is_production;

    const [loading, setLoading] = useState(false);
    const [editHeaders, setEditHeaders] = useState(false);
    const [headers, setHeaders] = useState<Record<string, string>>(() => environmentAndAccount?.environment.otlp_settings?.headers ?? {});
    const [errors, setErrors] = useState<{ index: number; key: 'name' | 'value'; error: string }[]>([]);

    useEffect(() => {
        if (!editHeaders) {
            setHeaders(environmentAndAccount?.environment.otlp_settings?.headers ?? {});
        }
    }, [editHeaders, environmentAndAccount?.environment.otlp_settings?.headers]);

    const onSaveHeaders = async () => {
        setLoading(true);
        try {
            const otlpHeaders = Object.entries(headers).map(([name, value]) => ({ name, value }));
            await patchEnvironmentAsync({ otlp_headers: otlpHeaders });
            setEditHeaders(false);
            setErrors([]);
        } catch (err) {
            let message = 'There was an issue updating the OTLP Headers';
            if (err instanceof APIError) {
                if (err.json.error.code === 'invalid_body' && err.json.error.errors) {
                    setErrors(
                        err.json.error.errors
                            .map((e: any) => {
                                if (e.path[0] !== 'otlp_headers') {
                                    return null as any;
                                }
                                return { index: e.path[1], key: e.path[2], error: e.message };
                            })
                            .filter(Boolean)
                    );
                } else {
                    message = err.json.error.message ?? message;
                }
            }
            toast({ title: message, variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const onCancelHeaders = () => {
        setErrors([]);
        setHeaders(environmentAndAccount?.environment.otlp_settings?.headers ?? {});
        setEditHeaders(false);
    };

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <SettingsContent title="Telemetry">
            <SettingsGroup
                label={
                    <div className="inline-flex items-center gap-2">
                        OTel real-time export
                        <ButtonLink target="_blank" to="https://nango.dev/docs/guides/platform/observability#opentelemetry-export" variant="ghost" size="icon">
                            <ExternalLink />
                        </ButtonLink>
                    </div>
                }
            >
                <div className="flex flex-col gap-7">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="otlp_endpoint">Endpoint</Label>
                        <EditableInput
                            id="otlp_endpoint"
                            initialValue={environmentAndAccount?.environment.otlp_settings?.endpoint || ''}
                            onSave={async (value) => {
                                try {
                                    await patchEnvironmentAsync({ otlp_endpoint: value });
                                    toast({ title: 'Successfully updated', variant: 'success' });
                                } catch (err) {
                                    toast({ title: 'Failed to update', variant: 'error' });
                                    throw err;
                                }
                            }}
                            placeholder="https://my.otlp.commector:4318"
                            canEdit={canEditEnvironment}
                        />
                    </div>
                    <fieldset className="flex flex-col gap-4">
                        <label htmlFor="otlp_headers" className="text-sm">
                            Headers
                        </label>
                        <div className="flex flex-col gap-5">
                            <KeyValueInput
                                initialValues={headers}
                                onChange={setHeaders}
                                placeholderKey="MY_HEADER"
                                placeholderValue="value"
                                disabled={!editHeaders || loading}
                                isSecret={true}
                                alwaysShowEmptyRow={editHeaders}
                            />
                            {errors.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    {errors.map((err, i) => (
                                        <div key={i} className="text-body-small-regular text-feedback-error-fg">
                                            Row {err.index + 1}, {err.key}: {err.error}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-start gap-3 mt-1.5">
                            {!editHeaders && (
                                <PermissionGate asChild condition={canEditEnvironment}>
                                    {(allowed) => (
                                        <Button variant={'secondary'} onClick={() => setEditHeaders(true)} disabled={!allowed}>
                                            Edit
                                        </Button>
                                    )}
                                </PermissionGate>
                            )}
                            {editHeaders && (
                                <>
                                    <Button variant="tertiary" onClick={onCancelHeaders}>
                                        Cancel
                                    </Button>
                                    <Button variant="primary" onClick={onSaveHeaders} loading={loading}>
                                        Save
                                    </Button>
                                </>
                            )}
                        </div>
                    </fieldset>
                </div>
            </SettingsGroup>
        </SettingsContent>
    );
};
