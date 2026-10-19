import { useNavigate } from 'react-router-dom';

import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/Select';

import type { Role } from '@nangohq/types';

export const roles: { value: Role; label: string; description: string }[] = [
    { value: 'administrator', label: 'Full access', description: 'Full access to all environments.' },
    {
        value: 'production_support',
        label: 'Support',
        description: 'Read-only access of non-sensitive data in production environments.'
    },
    { value: 'development_full_access', label: 'Contributor', description: 'Full access to non-production environments.' }
];

export const RoleSelect: React.FC<{
    value: Role;
    onChange: (value: Role) => void;
    hasRBAC?: boolean;
    triggerClassName?: string;
}> = ({ value, onChange, hasRBAC = true, triggerClassName = 'w-40' }) => {
    const navigate = useNavigate();

    return (
        <Select
            value={value}
            onValueChange={(nextValue) => {
                if (nextValue === 'upgrade-rbac') {
                    void navigate('/team/billing#plans');
                    return;
                }

                onChange(nextValue as Role);
            }}
        >
            <SelectTrigger className={triggerClassName}>
                <SelectValue placeholder="Select a role">{roles.find((r) => r.value === value)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start" className="p-0">
                {roles.map(({ value: v, label, description }) => {
                    const locked = !hasRBAC && v !== 'administrator';
                    return (
                        <SelectItem key={v} value={v} className="h-fit p-2 pr-6" disabled={locked}>
                            <div className="flex min-w-0 flex-col gap-1">
                                <span className="text-text-strong text-body-medium-regular">{label}</span>
                                <p className="text-text-secondary text-body-small-regular whitespace-normal">{description}</p>
                            </div>
                        </SelectItem>
                    );
                })}
                {!hasRBAC && (
                    <>
                        <SelectSeparator />
                        <SelectItem value="upgrade-rbac" className="h-fit p-2 pr-6">
                            <span className="text-text-secondary text-body-small-regular whitespace-normal">
                                Add the <span className="text-text-link">Growth add-on</span> to use Support and Contributor roles.
                            </span>
                        </SelectItem>
                    </>
                )}
            </SelectContent>
        </Select>
    );
};
