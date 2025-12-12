import { cn } from '@/utils/utils';

const SettingsGroup: React.FC<{ label: React.ReactNode; className?: string; children: React.ReactNode }> = ({ label, className, children }) => {
    return (
        <div className={cn('flex py-6 first:pt-0', className)}>
            <div className="flex-4/10">
                <div className="font-semibold text-sm">{label}</div>
            </div>
            <div className="flex-6/10">{children}</div>
        </div>
    );
};

export default SettingsGroup;
