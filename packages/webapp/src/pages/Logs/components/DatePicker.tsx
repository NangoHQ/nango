import { CalendarIcon } from '@radix-ui/react-icons';
import { IconCalendar, IconCheck } from '@tabler/icons-react';
import { format, subDays } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/Popover';
import { Button } from '../../../components/ui/button/Button';
import { getPresetRange, matchPresetFromRange, parseDateRange, presets } from '../../../utils/logs';
import { cn } from '../../../utils/utils';

import type { DateRange, Preset } from '../../../utils/logs';

const dateTimeFormat = 'LLL dd, HH:mm';

export const DatePicker: React.FC<{
    isLive: boolean;
    period: DateRange;
    onChange: (selected: DateRange, live: boolean) => void;
}> = ({ isLive, period, onChange }) => {
    const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);

    const [open, setOpen] = useState<boolean>(false);

    const [synced, setSynced] = useState<boolean>(false);
    const [date, setDate] = useState<DateRange>(period);

    const [customRangeInputValue, setCustomRangeInputValue] = useState<string>('');
    const [rangeInputErrorMessage, setRangeInputErrorMessage] = useState<string>('');

    const rangeInputExample = useMemo(() => {
        return `${format(subDays(new Date(), 1), dateTimeFormat)} - ${format(new Date(), dateTimeFormat)}`;
    }, []);

    const display = useMemo(() => {
        if (selectedPreset !== null) {
            return selectedPreset.label;
        }
        if (!date || !date.from || !date.to) {
            return 'Last 24 hours';
        }
        if (date.from && date.to) {
            return `${format(date.from, dateTimeFormat)} - ${format(date.to, dateTimeFormat)}`;
        }
        return format(date.from, dateTimeFormat);
    }, [date, selectedPreset]);

    const onClickPreset = (preset: Preset) => {
        const range = getPresetRange(preset.name);
        setSelectedPreset(preset);
        setCustomRangeInputValue(`${format(range.from, dateTimeFormat)} - ${format(new Date(), dateTimeFormat)}`);
        onChange(range, true);
        setOpen(false);
    };

    const onSubmitCustomRange = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setRangeInputErrorMessage('');

        const inputValue = e.currentTarget.querySelector('input')?.value;
        if (!inputValue) {
            setRangeInputErrorMessage('Set custom range');
            return;
        }

        const { dateRange, error } = parseDateRange(inputValue, dateTimeFormat);
        if (error || !dateRange) {
            setRangeInputErrorMessage(error || 'Invalid date');
            return;
        }

        setSelectedPreset(null);
        onChange(dateRange, false);
        setOpen(false);
    };

    useEffect(
        function initialSync() {
            if (synced) {
                return;
            }

            setSynced(true);
            setDate(period);
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
        <Popover
            open={open}
            onOpenChange={(open) => {
                setOpen(open);

                if (open) {
                    setCustomRangeInputValue(`${format(date?.from, dateTimeFormat)} - ${format(date?.to || new Date(), dateTimeFormat)}`);
                    setRangeInputErrorMessage('');
                }
            }}
        >
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
            <PopoverContent className="w-fit p-4 rounded-md text-sm text-grayscale-11 bg-grayscale-1" align="end">
                <div className="flex flex-col gap-4 w-80">
                    <div className="flex flex-col gap-1">
                        <div
                            className={cn(
                                'h-10 flex items-center bg-grayscale-3 rounded-md',
                                !selectedPreset && 'border border-grayscale-8',
                                rangeInputErrorMessage && 'border border-alert-red'
                            )}
                        >
                            <div className="w-12 flex-shrink-0 flex justify-center items-center h-full p-1 bg-grayscale-5 rounded-md font-medium">
                                <IconCalendar className="w-[18px] h-[18px]" />
                            </div>
                            <form onSubmit={onSubmitCustomRange} className="w-full">
                                <input
                                    type="text"
                                    placeholder={rangeInputExample}
                                    className="w-full bg-transparent text-sm text-grayscale-13 placeholder:text-grayscale-10 focus:outline-none focus:ring-0 border-none"
                                    value={customRangeInputValue}
                                    onChange={(e) => setCustomRangeInputValue(e.target.value)}
                                />
                            </form>
                        </div>
                        {rangeInputErrorMessage && <span className="text-alert-red text-sm">{rangeInputErrorMessage}</span>}
                    </div>
                    <div className="flex flex-col gap-2 w-80">
                        {presets.map((preset) => {
                            return (
                                <div
                                    key={preset.name}
                                    className={cn(
                                        'flex items-center gap-2 cursor-pointer hover:bg-grayscale-3 rounded-md',
                                        selectedPreset?.name === preset.name && 'bg-grayscale-3 text-grayscale-13'
                                    )}
                                    onClick={() => onClickPreset(preset)}
                                >
                                    <div className="flex-grow flex items-center gap-2">
                                        <div className="w-12 flex-shrink-0 flex justify-center items-center p-1 bg-grayscale-5 rounded-md font-medium">
                                            {preset.shortLabel}
                                        </div>
                                        <span>{preset.label}</span>
                                    </div>
                                    {selectedPreset?.name === preset.name && <IconCheck className="w-4 h-4 mr-2" />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};
