import type { ChartConfig } from '../../../components/ui/Chart';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../../../components/ui/Chart';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { usePostInsights } from '../../../hooks/useLogs';
import { useStore } from '../../../store';
import type { InsightsHistogramEntry, PostInsights } from '@nangohq/types';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useMemo } from 'react';

// const histogram = [
//     { date: new Date(Date.now() - 86400000 * 9), success: 9, failure: 9 },
//     { date: new Date(Date.now() - 86400000 * 8), success: 8, failure: 8 },
//     { date: new Date(Date.now() - 86400000 * 7), success: 7, failure: 7 },
//     { date: new Date(Date.now() - 86400000 * 6), success: 6, failure: 6 },
//     { date: new Date(Date.now() - 86400000 * 5), success: 5, failure: 5 },
//     { date: new Date(Date.now() - 86400000 * 4), success: 4, failure: 4 },
//     { date: new Date(Date.now() - 86400000 * 3), success: 3, failure: 3 },
//     { date: new Date(Date.now() - 86400000 * 2), success: 2, failure: 2 },
//     { date: new Date(Date.now() - 86400000), success: 1, failure: 1 },
//     { date: new Date(), success: 10, failure: 0 }
// ];

interface Entry {
    date: Date;
    success: number;
    failure: number;
}

const chartConfig = {
    success: {
        label: 'Success',
        color: '#5BB98B'
    },
    failure: {
        label: 'Failure',
        color: '#E5484D'
    }
} satisfies ChartConfig;

export const InsightChart: React.FC<{ title: string; type: PostInsights['Body']['type'] }> = ({ title, type }) => {
    const env = useStore((state) => state.env);
    const { loading, data } = usePostInsights(env, { type });

    const histogram = useMemo(() => {
        if (!data) {
            return [];
        }

        const startDate = new Date(Date.now() - 86400 * 14 * 1000);
        startDate.setHours(12, 0, 0, 0);
        const endDate = new Date();
        const dates = [];
        while (startDate <= endDate) {
            dates.push(startDate.toISOString().split('T')[0]);
            startDate.setDate(startDate.getDate() + 1);
        }

        const tmp: Entry[] = [];
        const map = new Map<string, InsightsHistogramEntry>();
        for (const entry of data.histogram) {
            map.set(entry.key, entry);
        }
        for (const date of dates) {
            const entry = map.get(date);
            tmp.push({ date: new Date(date), success: entry?.success || 0, failure: entry?.failure || 0 });
        }

        return tmp;
    }, [data]);

    console.log(type, histogram);
    if (loading) {
        <div className="border border-border-gray rounded-xl p-6">
            <h3 className="text-md text-white">{title}</h3>
            <Skeleton style={{ width: '50%' }} />
        </div>;
    }

    return (
        <div className="border border-border-gray rounded-xl p-6">
            <h3 className="text-md text-white">{title}</h3>
            <p className="text-text-light-gray text-sm">Last 14 days</p>
            <div className="mt-7">
                <ChartContainer config={chartConfig} className="h-[190px] w-full">
                    <BarChart data={histogram}>
                        <CartesianGrid vertical={false} stroke="#323439" />
                        <XAxis
                            dataKey="date"
                            interval={'preserveStartEnd'}
                            tickLine={false}
                            tickMargin={10}
                            minTickGap={20}
                            axisLine={false}
                            tickFormatter={(value) => {
                                return value.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric'
                                });
                            }}
                        />
                        <ChartTooltip
                            content={
                                <ChartTooltipContent
                                    labelFormatter={(_, pl) => {
                                        return new Date(pl[0].payload.date).toLocaleDateString('en-US', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric'
                                        });
                                    }}
                                />
                            }
                            cursor={{ fill: '#4d4d4d45' }}
                        />
                        <Bar
                            dataKey="success"
                            stackId="a"
                            fill="var(--color-success)"
                            strokeWidth={0}
                            animationDuration={250}
                            animationBegin={0}
                            radius={[0, 0, 4, 4]}
                        />
                        <Bar
                            dataKey="failure"
                            stackId="a"
                            fill="var(--color-failure)"
                            strokeWidth={0}
                            animationDuration={250}
                            animationBegin={0}
                            radius={[4, 4, 0, 0]}
                        />
                    </BarChart>
                </ChartContainer>
            </div>
        </div>
    );
};
