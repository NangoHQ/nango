import type { LogLevel } from './global';

export type MessageContent =
    | {
          type: 'log';
          level: LogLevel;
          source: 'nango' | 'user';
          msg: string;
          meta: MsgMeta;
      }
    | {
          type: 'error';
          level: 'error';
          source: 'nango' | 'user';
          msg: string;
          err: Error;
          meta: MsgMeta;
      }
    | {
          type: 'http';
          level: LogLevel;
          source: 'nango' | 'user';
          msg: string;
          // req: RequestOptions;
          // res: Response;
          meta: MsgMeta;
      };

export type MsgMeta = Record<string, unknown> | null;

export interface MessageTable {
    id?: string | undefined;

    operation_id: string;
    content: MessageContent;

    created_at?: string;
}

export interface MessageRow {
    id: string;

    operation_id: string;
    content: MessageContent;

    created_at: string;
}

export type MessageRowInsert = Pick<MessageRow, 'operation_id' | 'content'> & Partial<Pick<MessageRow, 'created_at'>> & { id?: string | undefined };
