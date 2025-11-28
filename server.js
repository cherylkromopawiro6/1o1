// Sincotechs HD Videochat - Node.js WebSocket signaling server
const WebSocket = require('ws');
const PORT = process.env.PORT || 4000;
const wss = new WebSocket.Server({ port: PORT });

// userId -> { socket, name, avatar, flag, busy }
const users = new Map();

function broadcastUserlist() {
    const list = [];
    users.forEach((value, key) => {
        list.push({
            id: key,
            name: value.name,
            avatar: value.avatar,
            flag: value.flag,
            busy: !!value.busy
        });
    });
    const msg = JSON.stringify({ type: 'userlist', users: list });
    users.forEach((u) => {
        if (u.socket.readyState === WebSocket.OPEN) {
            u.socket.send(msg);
        }
    });
}

function findUserBySocket(socket) {
    for (const [userId, u] of users.entries()) {
        if (u.socket === socket) {
            return { userId, data: u };
        }
    }
    return null;
}

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            return;
        }

        if (data.type === 'register') {
            const userId = String(data.userId);
            users.set(userId, {
                socket: ws,
                name: data.name || '',
                avatar: data.avatar || '',
                flag: data.flag || '',
                busy: false
            });
            broadcastUserlist();
            return;
        }

        const current = findUserBySocket(ws);
        if (!current) return;
        const fromId = current.userId;

        switch (data.type) {
            case 'offer': {
                const toId = String(data.to);
                const target = users.get(toId);
                if (!target) return;

                if (target.busy) {
                    ws.send(JSON.stringify({ type: 'busy', userId: toId }));
                    return;
                }

                current.data.busy = true;
                target.busy = true;
                broadcastUserlist();

                target.socket.send(JSON.stringify({
                    type: 'offer',
                    from: fromId,
                    sdp: data.sdp
                }));
                break;
            }
            case 'answer': {
                const toId = String(data.to);
                const target = users.get(toId);
                if (!target) return;
                target.socket.send(JSON.stringify({
                    type: 'answer',
                    from: fromId,
                    sdp: data.sdp
                }));
                break;
            }
            case 'ice-candidate': {
                const toId = String(data.to);
                const target = users.get(toId);
                if (!target) return;
                target.socket.send(JSON.stringify({
                    type: 'ice-candidate',
                    from: fromId,
                    candidate: data.candidate
                }));
                break;
            }
            case 'end-call': {
                const toId = String(data.to);
                const target = users.get(toId);
                if (target) {
                    target.socket.send(JSON.stringify({
                        type: 'call-ended',
                        from: fromId
                    }));
                    target.busy = false;
                }
                current.data.busy = false;
                broadcastUserlist();
                break;
            }
            case 'chat': {
                const toId = String(data.to);
                const target = users.get(toId);
                if (!target) return;
                target.socket.send(JSON.stringify({
                    type: 'chat',
                    from: fromId,
                    fromName: current.data.name || ('User ' + fromId),
                    message: data.message || ''
                }));
                break;
            }
        }
    });

    ws.on('close', () => {
        const current = findUserBySocket(ws);
        if (current) {
            users.delete(current.userId);
            broadcastUserlist();
        }
    });
});

console.log('Sincotechs HD Videochat signaling server running on port', PORT);
