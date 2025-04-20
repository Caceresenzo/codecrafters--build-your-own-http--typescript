import fs from 'fs'
import * as net from 'net'
import zlib from "zlib"

enum Status {
    OK = "200 OK",
    CREATED = "201 Created",
    NOT_FOUND = "404 Not Found",
}

enum Method {
    GET = "GET",
    POST = "POST",
}

type Request = (
    {
        path: string
        version: string
        headers: Record<string, string>,
    } & (
        {
            method: Method.GET
        } | {
            method: Method.POST
            body: Buffer
        }
    )
)

interface Response {
    status: Status,
    headers: Record<string, string>,
    body?: Buffer,
}

let directory = "."
if (process.argv.length == 4) {
    directory = process.argv[3]
    console.log({ directory })
}

function gzip(buffer: Buffer) {
    return zlib.gzipSync(buffer)
}

let socketIdIncrement = 0

const server = net.createServer(async (socket) => {
    async function readable(): Promise<{}> {
        return new Promise((resolve) => socket.on('readable', resolve))
    }

    async function readBytes(n: number = 0, awaitIfNull = true): Promise<Buffer> {
        const buffer = socket.read(n)
        if (buffer) {
            return new Promise<Buffer>((resolve) => resolve(buffer))
        }

        if (!awaitIfNull) {
            return Promise.resolve(Buffer.alloc(0))
        }

        await readable()
        return readBytes(n, false)
    }

    async function readLine() {
        let character: string
        let line = ""

        do {
            const buffer = await readBytes(1)
            if (!buffer.length) {
                return line
            }

            character = String.fromCharCode(buffer[0])
            line += character
        } while (character != '\n')

        return line.substring(0, line.length - 2)
    }

    async function parseRequest(): Promise<Request | null> {
        const requestLine = await readLine()
        if (!requestLine) {
            return Promise.resolve(null)
        }

        const [method, path, version] = requestLine.split(" ")

        const headers = {}
        let line: string
        while (line = await readLine()) {
            const [key, value] = line.split(": ")
            headers[key.toLowerCase()] = value
        }

        const isPost = method == "POST"
        if (!isPost) {
            return {
                method: Method.GET,
                path,
                version,
                headers
            }
        }

        const contentLength = parseInt(headers["Content-Length".toLowerCase()] || 0)
        const body = await readBytes(contentLength)

        return {
            method: Method.POST,
            path,
            version,
            headers,
            body
        }
    }

    async function route(request: Request): Promise<Response> {
        if (request.path == "/") {
            return {
                status: Status.OK,
                headers: {},
            }
        } else if (request.path.startsWith("/echo/")) {
            const message = request.path.substring(6)
            const buffer = Buffer.from(message, "utf-8")

            return {
                status: Status.OK,
                headers: {
                    "Content-Type": "text/plain",
                },
                body: buffer
            }
        } else if (request.path == "/user-agent") {
            const message = request.headers["User-Agent".toLowerCase()]
            const buffer = Buffer.from(message, "utf-8")

            return {
                status: Status.OK,
                headers: {
                    "Content-Type": "text/plain",
                },
                body: buffer
            }
        } else if (request.path.startsWith("/files/")) {
            const fileName = request.path.substring(7)
            const filePath = `${directory}/${fileName}`

            if (request.method == Method.POST) {
                fs.writeFileSync(filePath, request.body)

                return {
                    status: Status.CREATED,
                    headers: {},
                }
            } else if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath)

                return {
                    status: Status.OK,
                    headers: {
                        "Content-Type": "application/octet-stream",
                    },
                    body: content
                }
            }
        }

        return {
            status: Status.NOT_FOUND,
            headers: {},
        }
    }

    async function encode(request: Request, response: Response): Promise<Response> {
        const acceptEncoding: string = request.headers["Accept-Encoding".toLowerCase()] || ""

        let encoder: ((buffer: Buffer) => Buffer) | null = null
        for (let name of acceptEncoding.split(",")) {
            name = name.trim()

            if (name == "gzip") {
                encoder = gzip
                break
            }
        }

        if (encoder != null && response.body) {
            response.body = encoder(response.body)

            if (!response.headers) {
                response.headers = {}
            }

            response.headers["Content-Encoding"] = encoder.name
        }

        return response
    }

    function shoudCloseConnection(request: Request): boolean {
        const connection = request.headers["connection"]

        return connection == "close"
    }

    async function writeResponse(response: Response) {
        socket.write(`HTTP/1.1 ${response.status}\r\n`)
        for (const [key, value] of Object.entries(response.headers || {})) {
            socket.write(`${key}: ${value}\r\n`)
        }

        socket.write(`Content-Length: ${response.body?.length || 0}\r\n`)

        socket.write(`\r\n`)

        if (response.body) {
            socket.write(response.body)
        }
    }

    const socketId = ++socketIdIncrement

    console.log(`${socketId}: connected`)
    while (socket.readyState === "open") {
        const request = await parseRequest()
        if (!request) {
            break
        }

        let response = await route(request)
        console.log(`${socketId}: ${request.method} ${request.path} ${response.status}`)

        response = await encode(request, response)

        const shoudClose = shoudCloseConnection(request)
        if (shoudClose) {
            response.headers["Connection"] = "close"
        }

        await writeResponse(response)

        if (shoudClose) {
            break
        }
    }
    console.log(`${socketId}: disconnected`)

    socket.end()
})

console.log("codecrafters build-your-own-http")
server.listen(4221, 'localhost', () => {
    console.log('server is running on port 4221')
})
