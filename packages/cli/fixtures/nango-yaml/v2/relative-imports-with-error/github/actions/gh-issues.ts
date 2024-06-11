import { getGreeting } from './helper';
import { otherWelcome } from './welcomer';

export default function runAction(): string {
    otherWelcome();
    return getGreeting();
}
