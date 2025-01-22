export default interface IRequest {
    path: string,
    headers: HeaderHash,
    verb: Verbs,
    body: string
}

export enum Verbs{
    GET,
    POST
}
export interface HeaderHash {
    [key: string]: string
}