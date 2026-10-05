# Testing guide

## Automated checks

Run from the repository root:

```bash
python -m unittest discover -v
python -m py_compile app.py game/models.py game/engine.py
```

The suite covers physical component counts, 4-player minimum, odd-player Ronin setup, simultaneous secret commitments, numbered resolution, death before resolution, target legality, Shapeshifter secrecy, Graverobber timing, Soul Merchant token choice, scoring ties, joint game winners, lobby refresh, draft disconnects, and stale reconnect references.

## Browser smoke test

1. Open four independent browser tabs or profiles.
2. Create a room in the first and join with the other three.
3. Verify that Start is disabled below four players and enabled at four.
4. Complete both draft picks in every browser.
5. In each night phase, lock a choice or pass in every browser.
6. Confirm that choices remain secret until everyone locks, then resolve in card-number order.
7. At scoring, refresh the host tab. The result modal, private score values, room seat, and host permission must be restored.
8. Start the next round from the reconnected host.

## Cross-machine smoke test

The application has also been exercised with a macOS host and clients on Windows and Ubuntu over a private overlay network:

- both remote Chrome installations loaded and executed the full page;
- both machines completed Engine.IO and Socket.IO handshakes;
- both emitted `join_room` and received `room_joined` from the macOS server;
- the host browser received both remote players in real time.

For a public deployment, repeat this test behind the actual reverse proxy and TLS endpoint. Keep one application worker until room state is moved to a shared store.
