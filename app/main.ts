import * as net from 'net';

const server = net.createServer((socket) => {
    socket.write("HTTP/1.1 200 OK\r\n\r\n");
    socket.end();
});

console.log("codecrafters build-your-own-http");

server.listen(4221, 'localhost', () => {
    console.log('server is running on port 4221');
});
