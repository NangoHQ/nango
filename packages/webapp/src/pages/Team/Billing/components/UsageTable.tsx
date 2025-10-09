import { useMemo } from 'react';

import { Skeleton } from '@/components-v2/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';

import type { GetBillingUsage } from '@nangohq/types';

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

        // Create a map of all unique IDs from both current and previous
        const allIds = new Set([...data.data.current.map((item) => item.id), ...data.data.previous.map((item) => item.id)]);

        // Create the merged list
        return Array.from(allIds).map((id) => {
            const currentItem = data.data.current.find((item) => item.id === id);
            const previousItem = data.data.previous.find((item) => item.id === id);

            return {
                id,
                name: currentItem?.name || previousItem?.name || 'Unknown',
                current: currentItem?.quantity || 0,
                previous: previousItem?.quantity || 0
            };
        });
    }, [data]);

    if (isLoading || !data) {
        return (
            <div className="flex flex-col gap-2">
                <Skeleton className="w-1/2" />
                <Skeleton className="w-1/2" />
                <Skeleton className="w-1/2" />
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
                            <TableCell className="font-semibold">{item.name}</TableCell>
                            <TableCell className="text-center text-text-secondary">{item.previous}</TableCell>
                            <TableCell className="text-center text-text-secondary">{item.current}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};
