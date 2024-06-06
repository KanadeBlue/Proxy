const bedrock = require('bedrock-protocol');
const EventEmitter = require('events');

class BedrockProxy extends EventEmitter {
    constructor() {
        super();
        this.clientPort = 19134;
        this.servers = new Map();
        this.clients = new Map();
        this.start();
    }

    addServer(name, host, port) {
        this.servers.set(name, { host, port });
    }

    start() {
        this.server = bedrock.createServer({ host: '0.0.0.0', port: this.clientPort });

        this.server.on('connect', client => {
            const initialServer = this.servers.values().next().value;
            this.connectToServer(client, initialServer);

            client.on('packet', (packet, meta) => {
                if (meta.name === 'text' && packet.message.startsWith('/transfer')) {
                    const [, serverName] = packet.message.split(' ');
                    if (this.servers.has(serverName)) {
                        this.transferClient(client, serverName);
                    } else {
                        client.queue('text', { type: 'chat', needs_translation: false, source_name: '', message: `Server ${serverName} not found.` });
                    }
                } else {
                    const serverConnection = this.clients.get(client);
                    if (serverConnection) {
                        serverConnection.queue(meta.name, packet);
                    }
                }
            });

            client.on('end', () => {
                const serverConnection = this.clients.get(client);
                if (serverConnection) {
                    serverConnection.disconnect('Client disconnected');
                }
                this.clients.delete(client);
            });

            client.on('error', err => {
                console.error('Client error:', err);
                const serverConnection = this.clients.get(client);
                if (serverConnection) {
                    serverConnection.disconnect('Client error');
                }
                this.clients.delete(client);
            });
        });

        console.log(`Proxy listening on port ${this.clientPort}`);
    }

    connectToServer(client, server) {
        const serverConnection = bedrock.createClient({
            host: server.host,
            port: server.port,
            username: client.username,
            version: client.version,
            offline: true // If you want to allow offline mode, otherwise set it to false
        });

        this.clients.set(client, serverConnection);

        serverConnection.on('packet', (packet, meta) => {
            client.queue(meta.name, packet);
        });

        serverConnection.on('end', () => {
            client.disconnect('Server disconnected');
        });

        serverConnection.on('error', err => {
            console.error('Server error:', err);
            client.disconnect('Server error');
        });
    }

    transferClient(client, serverName) {
        const server = this.servers.get(serverName);
        const currentServerConnection = this.clients.get(client);
        if (currentServerConnection) {
            currentServerConnection.disconnect('Transferring to another server');
        }
        this.connectToServer(client, server);
        client.queue('text', { type: 'chat', needs_translation: false, source_name: '', message: `Transferred to server ${serverName}` });
    }
}

const proxy = new BedrockProxy(19132);

proxy.addServer('server1', 'localhost', 19133);
proxy.addServer('server2', 'localhost', 19134);

proxy.on('connect', (client, serverConnection) => {
    console.log('Client connected to proxy');
});

proxy.on('clientData', (data, client, serverConnection) => {
    console.log(`Data from client: ${data}`);
});

proxy.on('serverData', (data, client, serverConnection) => {
    console.log(`Data from server: ${data}`);
});

proxy.on('clientEnd', (client, serverConnection) => {
    console.log('Client disconnected');
});

proxy.on('serverEnd', (client, serverConnection) => {
    console.log('Server disconnected');
});

proxy.on('clientError', (err, client, serverConnection) => {
    console.error('Client error:', err);
});

proxy.on('serverError', (err, client, serverConnection) => {
    console.error('Server error:', err);
});
