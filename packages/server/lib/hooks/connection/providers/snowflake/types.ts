export interface SnowflakeQueryResponse {
    resultSetMetaData: {
        numRows: number;
        format: string;
        partitionInfo: {
            rowCount: number;
            uncompressedSize: number;
        }[];
        rowType: {
            name: string;
            database: string;
            schema: string;
            table: string;
            byteLength: number;
            collation: string | null;
            precision: number | null;
            scale: number | null;
            nullable: boolean;
            length: number;
            type: string;
        }[];
    };
    data: (string | number | boolean | null)[][];
    code: string;
    statementStatusUrl: string;
    requestId: string;
    sqlState: string;
    statementHandle: string;
    message: string;
    createdOn: number;
}
