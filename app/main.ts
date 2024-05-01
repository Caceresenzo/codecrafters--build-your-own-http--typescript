import * as net from 'net';

enum Status {
    OK = "200 OK",
    NOT_FOUND = "404 Not Found",
}

interface Response {
    status: Status,
    headers?: Record<string, string>,
    body?: Buffer,
}

const server = net.createServer(async (socket) => {
    async function readable(): Promise<{}> {
        return new Promise((resolve) => socket.on('readable', resolve));
    }

    async function readBytes(n: number = 0): Promise<Buffer> {
        const buffer = socket.read(n);
        if (buffer) {
            return new Promise<Buffer>((resolve) => resolve(buffer));
        }

        return new Promise<Buffer>(async (resolve) => {
            await readable()
            readBytes(n).then(resolve)
        });
    }

    async function readLine() {
        let character: string
        let line = ""

        do {
            character = String.fromCharCode((await readBytes(1))[0])
            line += character
        } while (character != '\n');

        return line.substring(0, line.length - 2)
    }

    const requestLine = await readLine()
    const [method, path, version] = requestLine.split(" ")

    const headers = {}

    let line;
    while (line = await readLine()) {
        const [key, value] = line.split(": ")
        headers[key.toLowerCase()] = value
    }

    let response: Response = {
        status: Status.NOT_FOUND
    }

    if (path == "/") {
        response = {
            status: Status.OK
        }
    } else if (path.startsWith("/echo/")) {
        const message = path.substring(6)
        const buffer = Buffer.from(message, "utf-8")

        response = {
            status: Status.OK,
            headers: {
                "Content-Type": "text/plain",
                "Content-Length": String(buffer.length),
            },
            body: buffer
        }
    } else if (path == "/user-agent") {
        const message = headers["User-Agent".toLowerCase()]
        const buffer = Buffer.from(message, "utf-8")

        response = {
            status: Status.OK,
            headers: {
                "Content-Type": "text/plain",
                "Content-Length": String(buffer.length),
            },
            body: buffer
        }
    }

    socket.write(`HTTP/1.1 ${response.status}\r\n`);
    for (const [key, value] of Object.entries(response.headers || {})) {
        socket.write(`${key}: ${value}\r\n`);
    }
    socket.write(`\r\n`);

    if (response.body) {
        socket.write(response.body);
    }

    socket.end();
});

console.log("codecrafters build-your-own-http");
server.listen(4221, 'localhost', () => {
    console.log('server is running on port 4221');
});
