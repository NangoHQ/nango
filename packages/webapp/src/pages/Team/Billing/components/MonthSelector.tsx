import { MonthStepper } from './MonthStepper';

interface MonthSelectorProps {
    onMonthChange?: (month: Date) => void;
}

/** Page-header month selector for the paid usage view. Backed by the shared `?month` param. */
export const MonthSelector: React.FC<MonthSelectorProps> = ({ onMonthChange }) => <MonthStepper size="md" onMonthChange={onMonthChange} />;
