import { parseAsString, useQueryState } from 'nuqs';

import { FIXTURE_ACCOUNT_PARAM, useFixtureData } from './usageBreakdownFixtures';
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
    const fixtureData = useFixtureData(fixturesFlag);
    const options = fixtureData?.FIXTURE_ACCOUNTS.map((a) => ({ id: a.id, label: a.label })) ?? [];
    const defaultId = fixtureData?.FIXTURE_ACCOUNTS[0]?.id ?? '';

    const [account, setAccount] = useQueryState(FIXTURE_ACCOUNT_PARAM, parseAsString.withDefault('').withOptions({ history: 'replace' }));

    if (!fixturesFlag || options.length === 0) {
        return null;
    }

    const value = options.some((o) => o.id === account) ? account : defaultId;

    return (
        <div className="flex items-center gap-2">
            <span className="text-text-secondary text-body-small-regular whitespace-nowrap">Fixture account</span>
            <Select value={value} onValueChange={(v) => void setAccount(v)}>
                <SelectTrigger size="sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                    {options.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};
