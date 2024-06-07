import { getGreeting } from './helper';

export default function runAction(): string | number {
    return getGreeting();
}
