import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { StyledLink } from '@/components/ui/StyledLink';

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
}> = ({ value, onChange, hasRBAC = true }) => {
    return (
        <Select value={value} onValueChange={(v) => onChange(v as Role)}>
            <SelectTrigger className="w-40">
                <SelectValue placeholder="Select a role">{roles.find((r) => r.value === value)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end" className="p-0 max-w-71">
                {roles.map(({ value: v, label, description }) => {
                    const locked = !hasRBAC && v !== 'administrator';
                    return (
                        <ConditionalTooltip
                            key={v}
                            condition={locked}
                            contentClassName="pointer-events-auto"
                            content={
                                <span>
                                    RBAC is only available for &apos;Growth&apos; plans.{' '}
                                    <StyledLink to={`/team/billing#plans`} className="text-s">
                                        Upgrade
                                    </StyledLink>
                                </span>
                            }
                            asChild
                        >
                            <span className="block">
                                <SelectItem value={v} className="h-fit p-2" disabled={locked}>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-text-strong text-body-medium-regular">{label}</span>
                                        <p className="text-text-secondary text-body-small-regular">{description}</p>
                                    </div>
                                </SelectItem>
                            </span>
                        </ConditionalTooltip>
                    );
                })}
            </SelectContent>
        </Select>
    );
};
