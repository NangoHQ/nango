import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { DayPicker } from 'react-day-picker';

import { buttonStyles } from './button/Button';
import { cn } from '../../utils/utils';

import type * as React from 'react';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn('p-3', className)}
            classNames={{
                months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
                month: 'space-y-4',
                caption: 'flex justify-center pt-1 relative items-center',
                caption_label: 'text-sm font-medium',
                nav: 'space-x-1 flex items-center',
                nav_button: cn(buttonStyles({ variant: 'active' }), 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'),
                nav_button_previous: 'absolute left-1',
                nav_button_next: 'absolute right-1',
                table: 'w-full border-collapse space-y-1',
                head_row: 'flex',
                head_cell: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
                row: 'flex w-full mt-2',
                cell: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                day: cn('h-9 w-9 p-0 font-normal aria-selected:opacity-100'),
                day_range_end: 'day-range-end',
                day_selected:
                    'bg-pure-black text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                day_today: 'bg-accent text-accent-foreground',
                day_outside:
                    'day-outside text-muted-foreground opacity-20 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30 disabled:opacity-5',
                day_disabled: 'text-muted-foreground opacity-20 disabled:opacity-10',
                day_range_middle: 'aria-selected:bg-pure-black aria-selected:text-accent-foreground',
                day_hidden: 'invisible',
                ...classNames
            }}
            components={{
                IconLeft: () => <ChevronLeftIcon className="h-4 w-4" />,
                IconRight: () => <ChevronRightIcon className="h-4 w-4" />
            }}
            {...props}
        />
    );
}
Calendar.displayName = 'Calendar';

export { Calendar };
