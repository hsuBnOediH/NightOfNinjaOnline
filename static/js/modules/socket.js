// ── Socket.IO wrapper ────────────────────────────────────────────────────────

import { gameState } from './state.js';

let _socket = null;

export function initializeSocket(handlers) {
    _socket = io({ reconnection: true, reconnectionDelay: 1000 });

    _socket.on('connected', (data) => {
        gameState.mySid = data.sid;
        console.log('[socket] connected', data.sid);

        // Attempt reconnection if we have a player_id
        const pid = sessionStorage.getItem('player_id');
        const rc  = sessionStorage.getItem('room_code');
        if (pid && rc) {
            _socket.emit('reconnect_player', { player_id: pid });
        }
    });

    // Register all event handlers
    for (const [event, handler] of Object.entries(handlers)) {
        _socket.on(event, (data) => {
            console.log(`[event] ${event}`, data);
            handler(data);
        });
    }

    return _socket;
}

export function emit(event, data) {
    if (_socket) _socket.emit(event, data);
}

export function getSocket() { return _socket; }
