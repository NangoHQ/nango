import { useEffect, useMemo, useState } from 'react';
import { CalendarIcon } from '@radix-ui/react-icons';
import { addDays, addMonths, format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/Popover';
import { cn } from '../../../utils/utils';
import { Button } from '../../../components/ui/button/Button';
import { Calendar } from '../../../components/ui/Calendar';
import type { Preset } from '../../../utils/logs';
import { getPresetRange, matchPresetFromRange, presets } from '../../../utils/logs';

export const DatePicker: React.FC<{
    isLive: boolean;
    period: DateRange;
    onChange: (selected: DateRange, live: boolean) => void;
}> = ({ isLive, period, onChange }) => {
    const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);

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
        if (selectedPreset !== null) {
            return selectedPreset.label;
        }
        if (!date || !date.from || !date.to) {
            return 'Last 24 hours';
        }
        if (date.from && date.to) {
            return `${format(date.from, 'LLL dd, HH:mm')} - ${format(date.to, 'LLL dd, HH:mm')}`;
        }
        return format(date.from, 'LLL dd, HH:mm');
    }, [date, selectedPreset]);

    const onClickPreset = (preset: Preset) => {
        const range = getPresetRange(preset.name);
        setSelectedPreset(preset);
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
            onClickPreset({ label: 'Last 24 hours', name: 'last24h' });
        } else {
            setSelectedPreset(null);
        }
    };

    useEffect(
        function initialSync() {
            if (synced) {
                return;
            }

            setSynced(true);
            setDate(period);
            setTmpDate(period);
            setSelectedPreset(matchPresetFromRange(period));
        },
        [period]
    );

    useEffect(
        function syncFromParent() {
            if (!synced) {
                return;
            }

            setDate(period);
        },
        [period]
    );

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="zombieGray"
                    size={'sm'}
                    className={cn('flex-grow truncate text-text-light-gray', period && selectedPreset?.name !== 'last24h' && 'text-white')}
                >
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
                        {presets.map((preset) => {
                            return (
                                <Button
                                    key={preset.name}
                                    variant={'zombieGray'}
                                    className={cn('justify-end', selectedPreset?.name === preset.name && 'bg-pure-black')}
                                    onClick={() => onClickPreset(preset)}
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
