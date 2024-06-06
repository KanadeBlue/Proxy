const net = require('net');
const EventEmitter = require('events');

class Proxy extends EventEmitter {
    constructor(clientPort) {
        super();
        this.clientPort = clientPort;
        this.servers = new Map();
        this.clients = new Map();
        this.start();
    }

    addServer(name, host, port) {
        this.servers.set(name, { host, port });
    }

    start() {
        this.server = net.createServer(clientSocket => {
            const initialServer = this.servers.values().next().value;
            this.connectToServer(clientSocket, initialServer);

            clientSocket.on('data', data => {
                const message = data.toString().trim();
                if (message.startsWith('/transfer')) {
                    const [, serverName] = message.split(' ');
                    if (this.servers.has(serverName)) {
                        this.transferClient(clientSocket, serverName);
                    } else {
                        clientSocket.write(`Server ${serverName} not found.\n`);
                    }
                } else {
                    const serverSocket = this.clients.get(clientSocket);
                    if (serverSocket) {
                        serverSocket.write(data);
                    }
                }
            });

            clientSocket.on('end', () => {
                const serverSocket = this.clients.get(clientSocket);
                if (serverSocket) {
                    serverSocket.end();
                }
                this.clients.delete(clientSocket);
            });

            clientSocket.on('error', err => {
                console.error('Client error:', err);
                const serverSocket = this.clients.get(clientSocket);
                if (serverSocket) {
                    serverSocket.end();
                }
                this.clients.delete(clientSocket);
            });
        });

        this.server.listen(this.clientPort, () => {
            console.log(`Proxy listening on port ${this.clientPort}`);
        });
    }

    connectToServer(clientSocket, server) {
        const serverSocket = new net.Socket();
        serverSocket.connect(server.port, server.host, () => {
            console.log('Connected to server', server.host, server.port);
            this.clients.set(clientSocket, serverSocket);
        });

        serverSocket.on('data', data => {
            clientSocket.write(data);
        });

        serverSocket.on('end', () => {
            clientSocket.end();
        });

        serverSocket.on('error', err => {
            console.error('Server error:', err);
            clientSocket.end();
        });
    }

    transferClient(clientSocket, serverName) {
        const server = this.servers.get(serverName);
        const currentServerSocket = this.clients.get(clientSocket);
        if (currentServerSocket) {
            currentServerSocket.end();
        }
        this.connectToServer(clientSocket, server);
        clientSocket.write(`Transferred to server ${serverName}\n`);
    }
}

const proxy = new Proxy(19132);

proxy.addServer('server1', '51.68.166.153', 19135);
proxy.addServer('server2', 'localhost', 19134);

proxy.on('connect', (clientSocket, serverSocket) => {
    console.log('Client connected to proxy');
});

proxy.on('clientData', (data, clientSocket, serverSocket) => {
    console.log(`Data from client: ${data}`);
});

proxy.on('serverData', (data, clientSocket, serverSocket) => {
    console.log(`Data from server: ${data}`);
});

proxy.on('clientEnd', (clientSocket, serverSocket) => {
    console.log('Client disconnected');
});

proxy.on('serverEnd', (clientSocket, serverSocket) => {
    console.log('Server disconnected');
});

proxy.on('clientError', (err, clientSocket, serverSocket) => {
    console.error('Client error:', err);
});

proxy.on('serverError', (err, clientSocket, serverSocket) => {
    console.error('Server error:', err);
});
