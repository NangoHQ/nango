import { IconServer } from '@tabler/icons-react';
import { useStore } from '../../../store';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { Input } from '../../../components/ui/input/Input';

export const ExportSettings: React.FC = () => {
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
                <h3 className="uppercase text-sm">Export Settings</h3>
            </div>
            <div className="px-8 flex flex-col gap-10 w-3/5">
                <fieldset className="flex flex-col gap-4">
                    <label htmlFor="webhookUrl" className="font-semibold">
                        OpenTelemetry endpoint
                    </label>
                    <Input
                        inputSize={'lg'}
                        variant={'black'}
                        name="webhookUrl"
                        value={environmentAndAccount.environment.otlp_settings?.endpoint || ''}
                        placeholder="https://my.otlp.commector:4318/v1"
                    />
                </fieldset>
            </div>
        </div>
    );
};
