import type { HeaderHash } from "./request";

export default interface IResponse {
    status: number;
    message?: string;
    messagebytes?: any;
    contentType?: string;
    headers?: HeaderHash
} 

