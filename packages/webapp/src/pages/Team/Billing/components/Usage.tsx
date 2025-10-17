import { UsageTable } from './UsageTable';
import { CriticalErrorAlert } from '@/components-v2/CriticalErrorAlert';
import { StyledLink } from '@/components-v2/StyledLink';
import { useApiGetBillingUsage } from '@/hooks/usePlan';
import { useStore } from '@/store';

export const Usage: React.FC = () => {
    const env = useStore((state) => state.env);

    const { data: usage, isLoading: usageIsLoading, error: usageError } = useApiGetBillingUsage(env);

    if (usageError) {
        return <CriticalErrorAlert message="Error loading usage" />;
    }
    return (
        <div className="w-full flex flex-col gap-6">
            <UsageTable data={usage} isLoading={usageIsLoading} />
            {usage?.data.customer.portalUrl && (
                <StyledLink icon to={usage.data.customer.portalUrl} type="external">
                    View usage details
                </StyledLink>
            )}
        </div>
    );
};
