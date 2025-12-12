import { IconExternalLink, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { EditableInput } from './EditableInput';
import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import { Input } from '../../../components/ui/input/Input';
import SecretInput from '../../../components/ui/input/SecretInput';
import { apiPatchEnvironment, useEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { cn } from '../../../utils/utils';
import { Button } from '@/components-v2/ui/button';

export const ExportSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { environmentAndAccount, mutate } = useEnvironment(env);

    const [loading, setLoading] = useState(false);
    const [editHeaders, setEditHeaders] = useState(false);
    const [headers, setHeaders] = useState<{ name: string; value: string }[]>(() =>
        environmentAndAccount &&
        environmentAndAccount.environment.otlp_settings?.headers &&
        Object.keys(environmentAndAccount.environment.otlp_settings?.headers).length > 0
            ? Object.entries(environmentAndAccount.environment.otlp_settings?.headers).map(([k, v]) => ({ name: k, value: v }))
            : [{ name: '', value: '' }]
    );
    const [errors, setErrors] = useState<{ index: number; key: 'name' | 'value'; error: string }[]>([]);

    const onEnabledEdit = () => {
        if (headers.length === 0 || headers[headers.length - 1].name !== '') {
            setHeaders((copy) => [...copy, { name: '', value: '' }]);
        }
        setEditHeaders(true);
    };

    const onUpdate = (key: 'name' | 'value', value: string, index: number) => {
        setHeaders((copy) => {
            copy[index][key] = value;
            if (copy.length === index + 1 && value !== '') {
                copy[index + 1] = { name: '', value: '' };
            }
            return [...copy];
        });
    };

    const onSaveHeaders = async () => {
        setLoading(true);
        const res = await apiPatchEnvironment(env, {
            otlp_headers: headers.filter((v) => v.name !== '' || v.value !== '')
        });
        setLoading(false);

        if ('error' in res.json) {
            toast({ title: 'There was an issue updating the OTLP Headers', variant: 'error' });
            if (res.json.error.code === 'invalid_body' && res.json.error.errors) {
                setErrors(
                    res.json.error.errors.map((err) => {
                        if (err.path[0] !== 'otlp_headers') {
                            return null as any;
                        }
                        return { index: err.path[1], key: err.path[2], error: err.message };
                    })
                );
            }
            return;
        }

        void mutate();

        setEditHeaders(false);
        setHeaders((prev) => (prev.length > 1 ? prev.filter((v) => v.name !== '' || v.value !== '') : prev));
        setErrors([]);
    };

    const onRemove = (index: number) => {
        if (index === 0 && headers.length === 1) {
            setHeaders([{ name: '', value: '' }]);
            setErrors([]);
        } else {
            setHeaders(headers.filter((_, i) => i !== index));
            setErrors(errors.filter((e) => e.index !== index));
        }
    };

    const onCancelHeaders = () => {
        setErrors([]);
        setHeaders(
            environmentAndAccount &&
                environmentAndAccount.environment.otlp_settings?.headers &&
                Object.keys(environmentAndAccount.environment.otlp_settings?.headers).length > 0
                ? Object.entries(environmentAndAccount.environment.otlp_settings?.headers).map(([k, v]) => ({ name: k, value: v }))
                : [{ name: '', value: '' }]
        );
        setEditHeaders(false);
    };

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <SettingsContent title="Telemetry">
            <SettingsGroup
                label={
                    <div className="flex gap-1.5">
                        OTel real-time export
                        <Link
                            className="flex gap-2 items-center"
                            target="_blank"
                            to="https://nango.dev/docs/implementation-guides/platform/open-telemetry-export"
                        >
                            <IconExternalLink stroke={1} size={18} />
                        </Link>
                    </div>
                }
            >
                <div className="flex flex-col gap-7">
                    <EditableInput
                        name="otlp_endpoint"
                        title="Endpoint"
                        subTitle
                        originalValue={environmentAndAccount?.environment.otlp_settings?.endpoint || ''}
                        apiCall={(value) => apiPatchEnvironment(env, { otlp_endpoint: value })}
                        onSuccess={() => void mutate()}
                        placeholder="https://my.otlp.commector:4318"
                    />
                    <fieldset className="flex flex-col gap-4">
                        <label htmlFor="otlp_headers" className="text-sm">
                            Headers
                        </label>
                        <div className="flex flex-col gap-2.5">
                            {headers.map((header, i) => {
                                const errorName = errors.find((err) => err.index === i && err.key === 'name');
                                const errorValue = errors.find((err) => err.index === i && err.key === 'value');
                                return (
                                    <div key={i} className="flex flex-col gap-0.5">
                                        <div className="flex gap-4">
                                            <Input
                                                value={header.name}
                                                onChange={(e) => onUpdate('name', e.target.value, i)}
                                                inputSize={'lg'}
                                                variant={'black'}
                                                className={cn('w-[200px]', errorName && 'border-alert-400')}
                                                placeholder="MY_HEADER"
                                                disabled={!editHeaders || loading}
                                            />
                                            <SecretInput
                                                value={header.value}
                                                onChange={(e) => onUpdate('value', e.target.value, i)}
                                                inputSize={'lg'}
                                                variant={'black'}
                                                className={cn('w-[200px] grow', errorValue && 'border-alert-400')}
                                                placeholder="value"
                                                disabled={!editHeaders || loading}
                                            />
                                            {editHeaders && (
                                                <Button variant="destructive" size="lg" onClick={() => !loading && onRemove(i)}>
                                                    <IconTrash stroke={1} />
                                                </Button>
                                            )}
                                        </div>
                                        {(errorName || errorValue) && (
                                            <div className="flex gap-2">
                                                <div className="w-[225px]">{errorName && <div className="text-alert-400 text-s">{errorName.error}</div>}</div>
                                                <div className="w-[225px]">{errorValue && <div className="text-alert-400 text-s">{errorValue.error}</div>}</div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex justify-start gap-3 mt-1.5">
                            {!editHeaders && (
                                <Button variant={'secondary'} onClick={() => onEnabledEdit()}>
                                    Edit
                                </Button>
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
