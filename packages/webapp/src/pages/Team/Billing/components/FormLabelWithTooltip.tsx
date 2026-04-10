import { InfoTooltip } from '@/components-v2/InfoTooltip';
import { FormLabel } from '@/components-v2/ui/form';

export const FormLabelWithTooltip: React.FC<{ children: React.ReactNode; required?: boolean; tooltip: string }> = ({ children, required, tooltip }) => (
    <FormLabel className="flex gap-2 items-center">
        {children}
        {required && <span className="text-alert-400">*</span>}
        <InfoTooltip side="right">{tooltip}</InfoTooltip>
    </FormLabel>
);
