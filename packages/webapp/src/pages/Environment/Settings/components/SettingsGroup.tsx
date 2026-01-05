import { cn } from '@/utils/utils';

const SettingsGroup: React.FC<{ label: React.ReactNode; className?: string; children: React.ReactNode }> = ({ label, className, children }) => {
    return (
        <div className={cn('flex', className)}>
            <div className="flex-4/10">
                <div className="text-body-medium-semi">{label}</div>
            </div>
            <div className="flex-6/10">{children}</div>
        </div>
    );
};

export default SettingsGroup;
