import { otherWelcome } from '../../../welcomer';
import { getGreeting } from './helper';

export default function runAction(): string {
    otherWelcome();
    return getGreeting();
}
