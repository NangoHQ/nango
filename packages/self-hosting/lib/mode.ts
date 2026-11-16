import { isCloud } from '@nangohq/utils';

/** One image, one entrypoint: at Nango it is the control plane for installations, anywhere else it is the installation side. */
export const mode: 'cloud' | 'installation' = isCloud ? 'cloud' : 'installation';
