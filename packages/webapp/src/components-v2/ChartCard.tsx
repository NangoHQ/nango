import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';
import { Skeleton } from './ui/skeleton';

import type { ApiBillingUsageMetric } from '@nangohq/types';

export function formatQuantity(quantity: number): string {
    return quantity.toLocaleString('en-US', {
        maximumFractionDigits: 2
    });
}

interface ChartCardProps {
    isLoading: boolean;
    data?: ApiBillingUsageMetric;
    timeframe: { start: string; end: string };
}

export const ChartCard: React.FC<ChartCardProps> = ({ isLoading, data, timeframe }) => {
    const chartConfig = {
        total: {
            label: 'Total',
            color: 'var(--color-brand-500)'
        }
    };

    const chartData = useMemo(() => {
        if (!data) return [];
        // Create a map of existing usage data by date
        // Note: timeframeStart is serialized as a string in the API response
        const usageMap = new Map<string, number>();
        data.usage.forEach((usage) => {
            const dateStr = typeof usage.timeframeStart === 'string' ? usage.timeframeStart : usage.timeframeStart.toISOString();
            const dateKey = dateStr.split('T')[0]; // YYYY-MM-DD format
            usageMap.set(dateKey, usage.quantity);
        });

        // Generate all days in the timeframe. Fill in missing days with undefined total
        const start = new Date(timeframe.start);
        const end = new Date(timeframe.end);
        const chartDataArr: { date: string; total: number | undefined }[] = [];

        const currentDate = new Date(start);
        currentDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(end);
        endDate.setUTCHours(0, 0, 0, 0);

        while (currentDate < endDate) {
            const dateKey = currentDate.toISOString().split('T')[0];
            chartDataArr.push({
                date: dateKey,
                total: usageMap.get(dateKey) ?? undefined
            });
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        return chartDataArr;
    }, [data?.usage, timeframe.start, timeframe.end]);

    // Calculate today's date in the same format as chart data (YYYY-MM-DD)
    const todayDateKey = useMemo(() => {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        return today.toISOString().split('T')[0];
    }, []);

    // Check if today is within the timeframe
    const showTodayLine = useMemo(() => {
        const start = new Date(timeframe.start);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(timeframe.end);
        end.setUTCHours(0, 0, 0, 0);
        const today = new Date(todayDateKey);
        return today >= start && today <= end;
    }, [timeframe.start, timeframe.end, todayDateKey]);

    const isEmpty = chartData.every((usage) => !usage.total || usage.total === 0);

    const ChartComponent = data?.view_mode === 'cumulative' ? AreaChart : BarChart;
    const ChartElement =
        data?.view_mode === 'cumulative' ? (
            <Area dataKey="total" fill="var(--color-total)" type="natural" strokeWidth={2} dot={false} />
        ) : (
            <Bar dataKey="total" fill="var(--color-total)" />
        );

    return (
        <div className="bg-bg-elevated rounded border border-transparent h-[424px] flex flex-col">
            <header className="px-6 py-3 flex justify-between items-center border-b border-border-muted flex-shrink-0">
                <div className="flex flex-col items-start justify-center h-11">
                    {isLoading || !data ? (
                        <Skeleton className="bg-bg-subtle h-4 w-32" />
                    ) : (
                        <>
                            <span className="text-text-primary text-body-large-semi">{data.label}</span>
                            {!isEmpty && data && <span className="text-text-secondary text-body-medium-regular">{formatQuantity(data.total)}</span>}
                        </>
                    )}
                </div>
            </header>
            <main className="px-6 py-4 flex-1 min-h-0 overflow-hidden">
                {!isEmpty && (
                    <ChartContainer config={chartConfig} className="h-full w-full">
                        <ChartComponent accessibilityLayer data={chartData} barCategoryGap={4}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border-muted)" />
                            <XAxis
                                dataKey="date"
                                tickLine={false}
                                tickMargin={10}
                                stroke="var(--color-bg-muted)"
                                tickFormatter={(value: string) => new Date(value).getUTCDate().toString()}
                            />
                            <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatQuantity(value)} />
                            {showTodayLine && <ReferenceLine x={todayDateKey} stroke="var(--color-border-muted)" strokeDasharray="3 3" strokeWidth={1} />}
                            <ChartTooltip
                                content={
                                    <ChartTooltipContent
                                        labelFormatter={(value) =>
                                            new Date(value).toLocaleDateString('en-US', {
                                                day: 'numeric',
                                                month: 'long',
                                                year: 'numeric',
                                                timeZone: 'UTC'
                                            })
                                        }
                                    />
                                }
                                animationDuration={200}
                            />
                            {ChartElement}
                        </ChartComponent>
                    </ChartContainer>
                )}

                {isLoading && (
                    <div className="flex flex-col items-center justify-center h-full">
                        <span className="text-text-secondary text-body-medium-regular">
                            <Loader2 className="animate-spin" />
                        </span>
                    </div>
                )}

                {isEmpty && (
                    <div className="flex flex-col items-center justify-center h-full">
                        <span className="text-text-secondary text-body-medium-regular">No data</span>
                    </div>
                )}
            </main>
        </div>
    );
};
