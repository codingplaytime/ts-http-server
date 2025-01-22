import * as net from "net";
import fs from 'node:fs';
import type IResponse from "./response.ts"
import { type IRequest, type HeaderHash, Verbs} from "./request.ts";
import zlib from 'zlib';
import { pipeline } from "node:stream";

const HOST = "localhost";
const PORT = 4221;
const REQUEST_URL_REGEX = 'GET (.*?) HTTP\/1.1';
const POST_REQUEST_URL_REGEX = 'POST (.*?) HTTP\/1.1';

const FILE_PATH_REGEX = '\/files\/(.*)'


 const server = net.createServer((socket) => {
    console.log("Connection is made");
    socket.on("data", (request) => {
        let response: ResponseBlob = {};
        try {
            let parsedRequest = parseUrl(request.toString());
            console.log("URL is " + parsedRequest.path);
            response = (parsedRequest.verb === Verbs.GET) ? 
                handleGetRequests(parsedRequest):handlePostRequests(parsedRequest);
        } catch(err) {
            console.error(err);
            let res:IResponse = {status:404};
            response = {response: res, responseStr: composeResponse(res)};
        }
        if (response.responseStr) {
            socket.write(response.responseStr);
        }else {
            const finalResponse = composeResponse(response.response);
            socket.write(finalResponse);
            console.log("Here " + finalResponse);
            socket.write(response.response.messagebytes);
        }
        socket.end();
    })
    socket.on("close", () => {
     socket.end();
    });
 });

 function parseUrl(request: string): IRequest {
    let parts: string[] = (request).split('\r\n');
    let headers : HeaderHash = {};
    //let body: Uint8Array;
    let body: string = "";
    for (let i =1; i < parts.length ; i++) {
        let subparts = parts[i].split(":");
        if (subparts.length == 2) {
            console.log(`${subparts[0]} = ${subparts[1].trim()}`);
            headers[subparts[0]] = subparts[1].trim();
        } else {
            if (subparts.length == 1 && parts[i] != '\r\n' ) {
                body = parts[i];
                console.log(`Body is ${body}`);
            }
        }
    }
    console.log(`Path is ${parts[0]}`);
    if (parts[0].startsWith("GET")) {
        let re: RegExp = new RegExp(REQUEST_URL_REGEX);
        let result = parts[0].match(re);
        let path = undefined;
        path = (result)?result[1]:"Invalid url";
        return {path: path, headers: headers, verb: Verbs.GET};
    } else if(parts[0].startsWith("POST")) {
        let re: RegExp = new RegExp(POST_REQUEST_URL_REGEX);
        let result = parts[0].match(re);
        let path = undefined;
        path = (result)?result[1]:"Invalid url";
        return {path: path, headers: headers, verb: Verbs.POST, body: body};
    } else {
        throw new Error("Unsupported path");
    }   
 }

 function handlePostRequests(request: IRequest): ResponseBlob {
    const file = request.path.split("/")[2];
    console.log(`Write log file ${file}`);
    const fileName = getDirFromArgs() + file;
    fs.writeFile(fileName, request.body, err => {
        if (err) {
            console.error(err);
        }
    });
    let response = {status: 201};
    return {response: response, responseStr: composeResponse(response)}
 }

 function getDirFromArgs(): string {
    const args = process.argv.slice(2);
    return args[1];
 }


 function checkValidEncoding(encodingFormats: string) {
    const clientSupportedEncodingFormats = encodingFormats.split(",");
    const trimmedFormats = clientSupportedEncodingFormats.map(v => v.trim());
    if (trimmedFormats.includes("gzip")) return true;
    return false;
 }
 interface ResponseBlob {
    response: IResponse,
    responseStr?: string
 }
 function handleGetRequests(request: IRequest): ResponseBlob {
    let path = request["path"];
    let headers:HeaderHash = {};
    if ("Accept-Encoding" in request.headers) {
        if (checkValidEncoding(request.headers["Accept-Encoding"])) {
            console.log("Setting the header to gzip");
            headers["Content-Encoding"] = "gzip";
        }
    } 
    let response: IResponse = {status: 200, headers: headers};
    if (path.startsWith("/echo/")) {
        let res = path.substring(6);
        if (headers["Content-Encoding"] === 'gzip') {
            console.log("GZipping");
            const buffer = Buffer.from(res, 'utf8');
            response.messagebytes = zlib.gzipSync(buffer);
            return {response:response};
        } else {
            response.message = res;
            console.log(`Path seen ${JSON.stringify(response)}`);

            return {response: response, responseStr: composeResponse(response)};
        }

    } else if (path.startsWith("/files/")) {
        const fileRegex = new RegExp(FILE_PATH_REGEX);
        const re = fileRegex.exec(path);//path.match(fileRegex);
        if (re) {
            const fileName = getDirFromArgs() + re[1];
            console.log("Reading file " + fileName);
            try {
                const content = fs.readFileSync(fileName, 'utf8');
                return {response: response, responseStr: 
                    composeResponse({status: 200,  message: content, contentType:'application/octet-stream'})};
            } catch(err) {
                console.log(err);
                return {response: response, responseStr: composeResponse({status: 404})};
            }
        } else {
            console.log("Incorrect filename");
        }

    }
    switch(path) {
        case "/":
            return {response: response, responseStr: composeResponse({status: 200})};
        case "/user-agent":
            console.log(`user agent seen ${request["headers"]["User-Agent"]}`);
            return {response: response, responseStr: composeResponse({status:200, message: request["headers"]["User-Agent"]})};    
        default:
            return {response: response, responseStr: composeResponse({status: 404})};    
    }
 }

 
 function composeResponse(response: IResponse): string {
    let baseResponse = 'HTTP/1.1';
    let header="";
    let finalMessage = "";
    for (const key in response.headers) {
        header = header + key + ": " + `${response.headers[key]}\r\n`;
    }
    if (response.message) {
        console.log("message is " + response.message);
        finalMessage = response.message;
    } 
    //dummy
    switch(response.status) {
        case 200:
            if (response.contentType) {
                baseResponse = `${baseResponse} 200 OK\r\nContent-Type: ${response.contentType}\r\n${header}`;
            } else {
                baseResponse = `${baseResponse} 200 OK\r\nContent-Type: text/plain\r\n${header}`;
            }
            finalMessage = (response.message !== undefined)?response.message:finalMessage;
             if (finalMessage) {
                return `${baseResponse}Content-Length: ${finalMessage.length}\r\n\r\n${finalMessage}`;
             } else if (response.messagebytes) {
                console.log("Resoponse metadata is ");
                baseResponse = `${baseResponse}Content-Length: ${response.messagebytes.length}\r\n\r\n`;
                console.log(`${baseResponse}`)
                return baseResponse;
             }
             return `${baseResponse}\r\n`;
        case 201:
            return `${baseResponse} 201 Created\r\n\r\n`;    
        case 404:
            return `${baseResponse} 404 Not Found\r\n\r\n`;
        default:
            return `${baseResponse} 500 Unhandled request`;
    }
 }

 server.listen(PORT, HOST, () => {
    console.log("Listening, server has been bound on ", server.address());
 });

