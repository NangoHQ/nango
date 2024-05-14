import { Input } from '../../../components/ui/input/Input';

export const SearchInOperation: React.FC<{ operationId: string }> = ({ operationId }) => {
    return (
        <div>
            <header>
                <Input placeholder="Search logs" />
            </header>
            <main></main>
        </div>
    );
};
