import { ArrowUpRight, Lock } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, Field, FieldError, Input } from '@nangohq/design-system';

import { KeyValueInput } from '@/components/patterns/KeyValueInput';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { usePermissions } from '@/hooks/usePermissions';
import { useCurrentPlan } from '@/hooks/usePlan';
import { validateUrl } from '@/pages/Integrations/utils';
import { globalEnv } from '@/utils/env';
import { useEnvironment, usePatchEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { RowErrors, rowErrorsFromApi } from './components/RowErrors';
import { SettingsCard, SettingsRow } from './components/SettingsCard';
import { apiErrorMessage, sameRecord } from './utils';

import type { RowError } from './components/RowErrors';

const SETUP_GUIDE_URL = 'https://nango.dev/docs/guides/platform/observability#opentelemetry-export';

export const Telemetry: React.FC = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { data } = useEnvironment(env);
    const otlpSettings = data?.environmentAndAccount?.environment.otlp_settings;
    const { mutateAsync: patchEnvironmentAsync, isPending } = usePatchEnvironment(env);

    const { data: planData } = useCurrentPlan(env);
    const plan = planData?.plan;
    const hasOtel = !globalEnv.features.plan || !plan || plan.has_otel;

    const { can } = usePermissions();
    const canEdit = can('environment:settings:update') && hasOtel;

    const savedEndpoint = otlpSettings?.endpoint ?? '';
    const savedHeaders = otlpSettings?.headers ?? {};
    const [endpoint, setEndpoint] = useState(savedEndpoint);
    const [headers, setHeaders] = useState<Record<string, string>>(savedHeaders);
    const [resetKey, setResetKey] = useState(0);
    const [errors, setErrors] = useState<RowError[]>([]);

    const endpointError = validateUrl(endpoint, true);
    const endpointChanged = endpoint !== savedEndpoint;
    const headersChanged = !sameRecord(headers, savedHeaders);

    const onSave = async () => {
        try {
            await patchEnvironmentAsync({
                ...(endpointChanged && { otlp_endpoint: endpoint }),
                ...(headersChanged && { otlp_headers: Object.entries(headers).map(([name, value]) => ({ name, value })) })
            });
            setErrors([]);
            toast({ title: 'OTel export settings saved', variant: 'success' });
        } catch (err) {
            setErrors(rowErrorsFromApi(err, 'otlp_headers'));
            toast({ title: apiErrorMessage(err, 'Failed to save OTel export settings'), variant: 'error' });
        }
    };

    return (
        <SettingsCard
            title={
                <span className="inline-flex items-center gap-2">
                    OTel export
                    {savedEndpoint && <Badge variant="success">Exporting</Badge>}
                </span>
            }
            action={
                <Button variant="ghost" size="sm" asChild>
                    <a href={SETUP_GUIDE_URL} target="_blank" rel="noopener noreferrer">
                        Setup guide
                        <ArrowUpRight />
                    </a>
                </Button>
            }
            dirty={endpointChanged || headersChanged}
            invalid={!!endpointError}
            saving={isPending}
            canEdit={canEdit}
            onSave={onSave}
            onDiscard={() => {
                setEndpoint(savedEndpoint);
                setHeaders(savedHeaders);
                setErrors([]);
                setResetKey((k) => k + 1);
            }}
        >
            <SettingsRow label="Endpoint" htmlFor="otlp_endpoint">
                <Field data-invalid={!!endpointError}>
                    <Input
                        id="otlp_endpoint"
                        mono
                        value={endpoint}
                        placeholder="https://otel.example.com:4318"
                        onChange={(e) => setEndpoint(e.target.value)}
                        disabled={!canEdit}
                        aria-invalid={!!endpointError}
                    />
                    {endpointError && <FieldError>{endpointError}</FieldError>}
                </Field>
            </SettingsRow>
            <SettingsRow label="Headers" description="Optional">
                <KeyValueInput
                    key={resetKey}
                    initialValues={headers}
                    onChange={setHeaders}
                    placeholderKey="X-Header-Name"
                    placeholderValue="value"
                    disabled={!canEdit}
                    isSecret
                />
                <RowErrors errors={errors} />
            </SettingsRow>
            {!hasOtel && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-muted pt-5">
                    <span className="inline-flex items-center gap-2 type-text-regular-sm text-text-secondary">
                        <Lock className="size-4" />
                        OTel export needs the Growth add-on.
                    </span>
                    <ButtonLink to="/team/billing#plans" variant="outline">
                        Get the Growth add-on
                    </ButtonLink>
                </div>
            )}
        </SettingsCard>
    );
};
