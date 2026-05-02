/** Versioned line-delimited stdio messages between Deno child and Node harness */
export interface SuperJsonPayload {
    json: Record<string, unknown>;
    meta?: Record<string, unknown>;
}

export type RpcMessageFromChild =
    | {
          v: 1;
          id: number;
          call: { path: string[]; args: SuperJsonPayload } | { iterNext: string };
      }
    | {
          v: 1;
          done: { ok: true; result: SuperJsonPayload } | { ok: false; error: SuperJsonPayload };
      };

export type RpcMessageToChild =
    | { v: 1; id: number; result?: SuperJsonPayload; error?: { message: string; stack?: string; name?: string } }
    | { v: 1; init: SuperJsonPayload };
