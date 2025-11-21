import { useMemo } from 'react';

import { Skeleton } from '@/components-v2/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';

import type { GetBillingUsage, UsageMetric } from '@nangohq/types';

export const UsageTable: React.FC<{ data: GetBillingUsage['Success'] | undefined; isLoading: boolean }> = ({ data, isLoading }) => {
    const currentMonth = useMemo(() => {
        return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date());
    }, []);
    const previousMonth = useMemo(() => {
        const prev = new Date();
        prev.setMonth(prev.getMonth() - 1);
        return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(prev);
    }, []);

    const mergedUsage = useMemo(() => {
        if (!data) return [];

        return Object.entries(data.data.current).map(([metric, usage]) => {
            return {
                id: metric,
                name: usage.label,
                current: usage.total,
                previous: data.data.previous[metric as UsageMetric]?.total
            };
        });
    }, [data]);

    if (isLoading || !data) {
        return (
            <div className="flex flex-col gap-2">
                <Skeleton className="w-full h-10" />
                <Skeleton className="w-full h-10" />
                <Skeleton className="w-full h-10" />
                <Skeleton className="w-full h-10" />
            </div>
        );
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className=""></TableHead>
                    <TableHead className="text-center">Previous ({previousMonth})</TableHead>
                    <TableHead className="text-center">Current ({currentMonth})</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {mergedUsage.map((item) => {
                    return (
                        <TableRow key={item.id}>
                            <TableCell className="font-medium pl-6">{item.name}</TableCell>
                            <TableCell className="text-center text-text-secondary">{item.previous}</TableCell>
                            <TableCell className="text-center text-text-secondary">{item.current}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};
