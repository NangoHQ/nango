import { parseAsString, useQueryState } from 'nuqs';

import { DEFAULT_FIXTURE_ACCOUNT_ID, FIXTURE_ACCOUNT_OPTIONS, FIXTURE_ACCOUNT_PARAM } from '../usageBreakdownFixtures';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useFeatureFlagsStore } from '@/store/feature-flags';

/**
 * Dev-only dropdown (next to the month picker) for choosing which captured prod
 * account's mock data the breakdown fixtures load. Visible only when the
 * `usageBreakdownFixtures` flag is on; writes the shared `fixtureAccount` query
 * param that the panels read.
 */
export const FixtureAccountSelector: React.FC = () => {
    const fixturesFlag = useFeatureFlagsStore((s) => s.usageBreakdownFixtures);
    const [account, setAccount] = useQueryState(
        FIXTURE_ACCOUNT_PARAM,
        parseAsString.withDefault(DEFAULT_FIXTURE_ACCOUNT_ID).withOptions({ history: 'replace' })
    );

    if (!fixturesFlag || FIXTURE_ACCOUNT_OPTIONS.length === 0) {
        return null;
    }

    const value = FIXTURE_ACCOUNT_OPTIONS.some((o) => o.id === account) ? account : DEFAULT_FIXTURE_ACCOUNT_ID;

    return (
        <div className="flex items-center gap-2">
            <span className="text-text-secondary text-body-small-regular whitespace-nowrap">Fixture account</span>
            <Select value={value} onValueChange={(v) => void setAccount(v)}>
                <SelectTrigger size="sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                    {FIXTURE_ACCOUNT_OPTIONS.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};
