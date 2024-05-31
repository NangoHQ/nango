import { useEffect, useMemo, useState } from 'react';
import { CalendarIcon, LightningBoltIcon } from '@radix-ui/react-icons';
import { addDays, format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/Popover';
import { cn } from '../../../utils/utils';
import Button from '../../../components/ui/button/Button';
import { Calendar } from '../../../components/ui/Calendar';

// Define presets
const presets: { name: string; label: string }[] = [
    { name: 'last5m', label: 'Last 5 minutes' },
    { name: 'last1h', label: 'Last hour' },
    { name: 'last24h', label: 'Last 24 hour' },
    { name: 'today', label: 'Today' },
    { name: 'last7', label: 'Last 7 days' },
    { name: 'last14', label: 'Last 14 days' }
];
const getPresetRange = (presetName: string): DateRange => {
    const preset = presets.find(({ name }) => name === presetName)!;
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
        case 'today':
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
    period?: { from: string; to: string };
    onChange: (selected: DateRange | undefined) => void;
}> = ({ period, onChange }) => {
    const [selectedPreset, setSelectedPreset] = useState<string | undefined>(undefined);

    const [date, setDate] = useState<DateRange | undefined>();
    const [tmpDate, setTmpDate] = useState<DateRange | undefined>();

    const months = useMemo(() => {
        const today = new Date();
        return today.getDate() < 24 ? 2 : 1;
    }, []);

    const disabledBefore = useMemo(() => {
        return addDays(new Date(), -14);
    }, []);

    const disabledAfter = useMemo(() => {
        return new Date();
    }, []);

    const display = useMemo(() => {
        if (!date || !date.from || !date.to) {
            return 'Live - Last 14 days';
        }
        if (date.from && date.to) {
            return `${format(date.from, 'LLL dd, HH:mm')} - ${format(date.to, 'LLL dd, HH:mm')}`;
        }
        return format(date.from, 'LLL dd, HH:mm');
    }, [date]);

    const onClickPreset = (preset: string) => {
        const range = getPresetRange(preset);
        setSelectedPreset(preset);
        onChange(range);
        setTmpDate(range);
    };

    const onClickLive = () => {
        setSelectedPreset(undefined);
        onChange(undefined);
        setTmpDate(undefined);
    };

    useEffect(() => {
        setDate(period ? { from: new Date(period.from), to: new Date(period.to) } : undefined);
    }, [period]);

    useEffect(() => {
        // We use a tmp date because we only want to commit full range, not partial from/to
        if (!tmpDate || (tmpDate.from && tmpDate.to)) {
            onChange(tmpDate);
        }
    }, [tmpDate]);

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="zombieGray" size={'xs'} className={cn('flex-grow truncate w-[230px]')}>
                    <CalendarIcon />
                    {display}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 text-white bg-active-gray">
                <div className="flex gap-6">
                    <Calendar
                        mode="range"
                        defaultMonth={date?.from}
                        selected={tmpDate}
                        onSelect={(e) => {
                            setSelectedPreset(undefined);
                            if (e?.from) {
                                e.from.setHours(0, 0, 0);
                            }
                            if (e?.to) {
                                e.to.setHours(23, 59, 59);
                            }
                            setTmpDate(e);
                        }}
                        initialFocus
                        numberOfMonths={months}
                        disabled={{ before: disabledBefore, after: disabledAfter }}
                        weekStartsOn={1}
                    />
                    <div className="flex flex-col mt-6">
                        <Button
                            variant="zombieGray"
                            size={'xs'}
                            className={cn('justify-end', !selectedPreset && !date && 'bg-pure-black')}
                            onClick={onClickLive}
                        >
                            <LightningBoltIcon />
                            Live
                        </Button>
                        {presets.map((preset) => {
                            return (
                                <Button
                                    key={preset.name}
                                    variant={'zombieGray'}
                                    className={cn('justify-end', selectedPreset === preset.name && 'bg-pure-black')}
                                    onClick={() => onClickPreset(preset.name)}
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
