import { isEnterprise } from '@nangohq/utils';

export const CONNECTIONS_WITH_SCRIPTS_CAP_LIMIT = isEnterprise ? Infinity : 3;
