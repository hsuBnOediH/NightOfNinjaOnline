"""Gunicorn settings read automatically from the working directory."""

import os
import sys


def worker_exit(server, worker):
    # Under eventlet, normal interpreter teardown runs logging's weakref
    # callbacks after the hub's greenlets are gone and prints
    # "greenlet is being finalized".  The worker has already finished
    # serving, so flush output and exit without that teardown.
    if worker.__class__.__name__ == 'EventletWorker':
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(0)
