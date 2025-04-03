import { isEnterprise } from '@nangohq/utils';

export const PROD_ENVIRONMENT_NAME = 'prod';

export const CONNECTIONS_WITH_SCRIPTS_CAP_LIMIT = isEnterprise ? Infinity : 3;
