import { useEffect, useMemo, useState } from 'react';
import { CalendarIcon } from '@radix-ui/react-icons';
import { addDays, addMonths, format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/Popover';
import { cn } from '../../../utils/utils';
import Button from '../../../components/ui/button/Button';
import { Calendar } from '../../../components/ui/Calendar';

// Define presets
const presets: { name: string; label: string }[] = [
    { name: 'last5m', label: 'Last 5 minutes' },
    { name: 'last1h', label: 'Last hour' },
    { name: 'last24h', label: 'Last 24 hours' },
    { name: 'last3', label: 'Last 3 days' },
    { name: 'last7', label: 'Last 7 days' },
    { name: 'last14', label: 'Last 14 days' }
];
const getPresetRange = (index: number): DateRange => {
    const preset = presets[index];
    const from = new Date();
    const to = new Date();

    switch (preset.name) {
        case 'last5m':
            from.setMinutes(from.getMinutes() - 5);
            break;
        case 'last1h':
            from.setMinutes(from.getMinutes() - 60);
            break;
        case 'last24h':
            from.setDate(from.getDate() - 1);
            break;
        case 'last3':
            from.setDate(from.getDate() - 2);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);
            break;
        case 'last7':
            from.setDate(from.getDate() - 6);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);
            break;
        case 'last14':
            from.setDate(from.getDate() - 13);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);
            break;
    }

    return { from, to };
};

export const DatePicker: React.FC<{
    isLive: boolean;
    period?: { from: string; to: string };
    onChange: (selected: DateRange | undefined, live: boolean) => void;
}> = ({ isLive, period, onChange }) => {
    const [selectedPreset, setSelectedPreset] = useState<number | undefined>(undefined);

    const [synced, setSynced] = useState<boolean>(false);
    const [date, setDate] = useState<DateRange | undefined>();
    const [tmpDate, setTmpDate] = useState<DateRange | undefined>();

    const defaultMonth = useMemo(() => {
        const today = new Date();
        return today.getDate() > 15 ? today : addMonths(today, -1);
    }, []);

    const disabledBefore = useMemo(() => {
        return addDays(new Date(), -14);
    }, []);

    const disabledAfter = useMemo(() => {
        return new Date();
    }, []);

    const display = useMemo(() => {
        if (typeof selectedPreset !== 'undefined') {
            return presets[selectedPreset].label;
        }
        if (!date || !date.from || !date.to) {
            return 'Last 24 hours';
        }
        if (date.from && date.to) {
            return `${format(date.from, 'LLL dd, HH:mm')} - ${format(date.to, 'LLL dd, HH:mm')}`;
        }
        return format(date.from, 'LLL dd, HH:mm');
    }, [date, selectedPreset]);

    const onClickPreset = (index: number) => {
        const range = getPresetRange(index);
        setSelectedPreset(index);
        setTmpDate(range);
        onChange(range, true);
    };

    const onClickCalendar = (e?: DateRange) => {
        if (e?.from) {
            e.from.setHours(0, 0, 0);
        }
        if (e?.to) {
            e.to.setHours(23, 59, 59);
        }

        setTmpDate(e);

        if (e?.from && e?.to) {
            // Commit change only on full range
            onChange(e, e.to.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]);
        }

        if (!e?.from && !e?.to) {
            // Unselected everything should fallback to default preset
            onClickPreset(2);
        } else {
            setSelectedPreset(undefined);
        }
    };

    useEffect(
        function initialSync() {
            if (synced) {
                return;
            }

            setSynced(true);
            if (period) {
                const range = { from: new Date(period.from), to: new Date(period.to) };
                setDate(range);
                setTmpDate(range);
            } else {
                setSelectedPreset(2);
            }
        },
        [period]
    );

    useEffect(
        function syncFromParent() {
            if (!synced) {
                return;
            }

            if (period) {
                const range = { from: new Date(period.from), to: new Date(period.to) };
                setDate(range);
            } else {
                setDate(undefined);
                onClickPreset(2);
            }
        },
        [period]
    );

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="zombieGray" size={'xs'} className={cn('flex-grow truncate text-text-light-gray', period && 'text-white')}>
                    <CalendarIcon />
                    {display} {isLive && '(live)'}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 text-white bg-active-gray" align="end">
                <div className="flex gap-6">
                    <Calendar
                        mode="range"
                        defaultMonth={defaultMonth}
                        selected={tmpDate}
                        onSelect={onClickCalendar}
                        initialFocus
                        numberOfMonths={2}
                        disabled={{ before: disabledBefore, after: disabledAfter }}
                        weekStartsOn={1}
                        showOutsideDays={false}
                    />
                    <div className="flex flex-col mt-6">
                        {presets.map((preset, index) => {
                            return (
                                <Button
                                    key={preset.name}
                                    variant={'zombieGray'}
                                    className={cn('justify-end', selectedPreset === index && 'bg-pure-black')}
                                    onClick={() => onClickPreset(index)}
                                >
                                    {preset.label}
                                </Button>
                            );
                        })}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};

{
    /*  */
}
