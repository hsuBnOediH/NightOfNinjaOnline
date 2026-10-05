"""Gunicorn settings read automatically from the working directory."""

import os
import sys


def post_worker_init(worker):
    # On SIGTERM (every deploy) gunicorn stops accepting and then waits up to
    # graceful_timeout for open WebSockets, which never end on their own: it
    # SIGKILLs the worker ("Perhaps out of memory?") or, if the browser leaves
    # first, eventlet logs "socket shutdown error: [Errno 9] Bad file
    # descriptor".  Once the worker has stopped listening, close every client
    # connection ourselves so the worker exits at once and cleanly; browsers
    # see a transport drop and reconnect to the new instance.
    if worker.__class__.__name__ != 'EventletWorker':
        return
    import eventlet

    def close_clients_on_stop():
        while worker.alive:
            eventlet.sleep(0.2)
        with eventlet.Timeout(5, False):
            # gunicorn's listener wrappers drop .sock when closed.
            while any(getattr(s, 'sock', None) is not None for s in worker.sockets):
                eventlet.sleep(0.05)
        _close_all_clients()

    eventlet.spawn_n(close_clients_on_stop)


def _close_all_clients():
    import gc
    import socket
    import eventlet
    from eventlet import websocket
    from app import socketio

    # A WebSocket handler blocks reading until its TCP connection ends, and
    # eventlet does not wake a reader when another greenlet closes the socket.
    # Shut the open connections down so each reader sees EOF and its handler
    # finishes normally.  Nothing keeps a registry of them, hence gc.
    for ws in [o for o in gc.get_objects() if isinstance(o, websocket.RFC6455WebSocket)]:
        if not ws.websocket_closed and ws.socket.fileno() != -1:
            try:
                ws.socket.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
    eventlet.sleep(0.5)
    # Remaining long-polling clients.
    socketio.server.eio.disconnect()


def worker_exit(server, worker):
    # Under eventlet, normal interpreter teardown runs logging's weakref
    # callbacks after the hub's greenlets are gone and prints
    # "greenlet is being finalized".  The worker has already finished
    # serving, so flush output and exit without that teardown.
    if worker.__class__.__name__ == 'EventletWorker':
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(0)
