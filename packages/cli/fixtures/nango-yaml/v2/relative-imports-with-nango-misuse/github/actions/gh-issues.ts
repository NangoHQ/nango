import { getGreeting } from './helper';
import { otherWelcome } from './welcomer';

export default function runAction(nango: any): string {
    otherWelcome(nango);
    return getGreeting();
}
