import unittest

import app as server
from game.models import (
    Card, CardType, GamePhase, HouseCard, HouseType,
    PendingPrompt, PromptType,
)


def events(client, name=None):
    received = client.get_received()
    if name is None:
        return received
    return [event for event in received if event["name"] == name]


class SocketFlowTests(unittest.TestCase):
    def setUp(self):
        server.game_rooms.clear()
        server.player_id_map.clear()
        self.clients = [
            server.socketio.test_client(server.app, flask_test_client=server.app.test_client())
            for _ in range(4)
        ]
        for client in self.clients:
            events(client)

    def tearDown(self):
        for client in self.clients:
            if client.is_connected():
                client.disconnect()
        server.game_rooms.clear()
        server.player_id_map.clear()

    def test_four_players_can_finish_a_no_action_round(self):
        self.clients[0].emit("create_room", {"name": "Host", "avatar": 1})
        code = next(iter(server.game_rooms))

        for index, client in enumerate(self.clients[1:], start=2):
            client.emit("join_room", {
                "room_code": code,
                "name": f"Player {index}",
                "avatar": index,
            })
        for client in self.clients:
            events(client)

        self.clients[0].emit("start_game", {"room_code": code})
        self.assertEqual("drafting", server.game_rooms[code].phase.value)

        # Two simultaneous draft picks per player.
        for _round in (1, 2):
            for client in self.clients:
                client.emit("select_draft_card", {
                    "room_code": code,
                    "card_index": 0,
                })
            for client in self.clients:
                events(client)

        room = server.game_rooms[code]
        self.assertEqual("night", room.phase.value)
        self.assertEqual("committing", room.night_stage)

        # Everyone passes all five ranks.  The server must move through ranks
        # without exposing hand ownership and then score the round.
        for expected_rank in range(1, 6):
            self.assertEqual(expected_rank, room.current_rank)
            for client in self.clients:
                client.emit("commit_phase", {"room_code": code, "card_ids": []})
            if expected_rank < 5:
                self.assertEqual(expected_rank + 1, room.current_rank)
                self.assertEqual("committing", room.night_stage)

        self.assertIn(room.phase.value, ("scoring", "game_over"))
        self.assertGreater(sum(len(p.score_tokens) for p in room.players), 0)

    def test_three_player_standard_game_is_rejected(self):
        self.clients[0].emit("create_room", {"name": "Host", "avatar": 1})
        code = next(iter(server.game_rooms))
        for index, client in enumerate(self.clients[1:3], start=2):
            client.emit("join_room", {
                "room_code": code,
                "name": f"P{index}",
                "avatar": index,
            })
        events(self.clients[0])
        self.clients[0].emit("start_game", {"room_code": code})
        self.assertEqual("lobby", server.game_rooms[code].phase.value)

    def test_lobby_refresh_reclaims_the_same_host_seat(self):
        original = self.clients[0]
        original.emit("create_room", {"name": "Host", "avatar": 1})
        code = next(iter(server.game_rooms))
        room = server.game_rooms[code]
        player = room.players[0]
        player_id = player.player_id
        old_sid = player.sid

        original.disconnect()
        self.assertIn(code, server.game_rooms)
        self.assertFalse(player.connected)

        replacement = server.socketio.test_client(
            server.app, flask_test_client=server.app.test_client()
        )
        self.clients.append(replacement)
        replacement.emit("reconnect_player", {"player_id": player_id})

        self.assertTrue(player.connected)
        self.assertNotEqual(old_sid, player.sid)
        self.assertEqual(player.sid, room.host_sid)
        self.assertEqual((code, player.sid), server.player_id_map[player_id])

    def test_refresh_before_old_socket_closes_takes_over_the_seat(self):
        # Behind a proxy a refreshed tab's new socket can arrive before the
        # server notices the old one closed.  The seat credential wins.
        self.clients[0].emit("create_room", {"name": "Host", "avatar": 1})
        code = next(iter(server.game_rooms))
        for index, client in enumerate(self.clients[1:], start=2):
            client.emit("join_room", {
                "room_code": code,
                "name": f"P{index}",
                "avatar": index,
            })
        self.clients[0].emit("start_game", {"room_code": code})
        room = server.game_rooms[code]
        stale_client = self.clients[1]
        player = room.players[1]
        old_sid = player.sid
        self.assertTrue(player.connected)

        replacement = server.socketio.test_client(
            server.app, flask_test_client=server.app.test_client()
        )
        self.clients.append(replacement)
        replacement.emit("reconnect_player", {"player_id": player.player_id})

        self.assertTrue(player.connected)
        self.assertNotEqual(old_sid, player.sid)
        self.assertEqual((code, player.sid), server.player_id_map[player.player_id])
        # The superseded socket is closed and did not auto-pick a draft card.
        self.assertFalse(stale_client.is_connected())
        self.assertNotIn(player.sid, room.draft_state["selections"])
        self.assertNotIn(old_sid, room.draft_state["selections"])

    def _start_four_player_game(self):
        self.clients[0].emit("create_room", {"name": "Host", "avatar": 1})
        code = next(iter(server.game_rooms))
        for index, client in enumerate(self.clients[1:], start=2):
            client.emit("join_room", {
                "room_code": code,
                "name": f"P{index}",
                "avatar": index,
            })
        self.clients[0].emit("start_game", {"room_code": code})
        return code, server.game_rooms[code]

    def _reconnect(self, player_id):
        replacement = server.socketio.test_client(
            server.app, flask_test_client=server.app.test_client()
        )
        self.clients.append(replacement)
        replacement.emit("reconnect_player", {"player_id": player_id})
        return replacement

    def test_draft_pick_waits_for_a_reconnecting_player(self):
        code, room = self._start_four_player_game()
        for client in self.clients[:3]:
            client.emit("select_draft_card", {"room_code": code, "card_index": 0})

        player = room.players[3]
        offered = [card.id for card in room.draft_state["hands"][player.sid]]
        self.clients[3].disconnect()

        # Inside the grace period nothing is chosen for the player.
        self.assertEqual(1, room.draft_state["round"])
        self.assertFalse(player.away)

        replacement = self._reconnect(player.player_id)
        self.assertTrue(player.connected)
        self.assertEqual(
            offered, [card.id for card in room.draft_state["hands"][player.sid]])

        replacement.emit("select_draft_card", {"room_code": code, "card_index": 1})
        self.assertEqual(2, room.draft_state["round"])
        self.assertIn(offered[1], [card.id for card in player.hand])

    def test_draft_auto_selects_after_grace_expires_and_can_reconnect(self):
        code, room = self._start_four_player_game()
        for client in self.clients[:3]:
            client.emit("select_draft_card", {"room_code": code, "card_index": 0})

        player = room.players[3]
        old_sid = player.sid
        self.clients[3].disconnect()
        server._expire_reconnect_grace(
            code, player.player_id, player.disconnect_version)

        self.assertTrue(player.away)
        self.assertEqual(2, room.draft_state["round"])
        self.assertIn(old_sid, room.draft_state["hands"])

        self._reconnect(player.player_id)
        self.assertTrue(player.connected)
        self.assertFalse(player.away)
        self.assertNotIn(old_sid, room.draft_state["hands"])
        self.assertIn(player.sid, room.draft_state["hands"])

    def test_night_commit_waits_for_grace_then_auto_passes(self):
        code, room = self._start_four_player_game()
        for _round in (1, 2):
            for client in self.clients:
                client.emit("select_draft_card", {"room_code": code, "card_index": 0})
        self.assertEqual(GamePhase.NIGHT, room.phase)
        self.assertEqual("committing", room.night_stage)
        rank = room.current_rank

        player = room.players[3]
        self.clients[3].disconnect()
        for client in self.clients[:3]:
            client.emit("commit_phase", {"room_code": code, "card_ids": []})

        # Still waiting on the disconnected player's secret decision.
        self.assertEqual(rank, room.current_rank)
        self.assertNotIn(player.sid, room.phase_commitments)

        server._expire_reconnect_grace(
            code, player.player_id, player.disconnect_version)
        self.assertTrue(player.away)
        self.assertNotEqual(rank, room.current_rank)

    def test_reconnect_updates_attacker_reference_in_someone_elses_prompt(self):
        self.clients[0].emit("create_room", {"name": "Host", "avatar": 1})
        code = next(iter(server.game_rooms))
        self.clients[1].emit("join_room", {
            "room_code": code,
            "name": "Target",
            "avatar": 2,
        })
        room = server.game_rooms[code]
        attacker = room.players[0]
        target = room.players[1]
        player_id = attacker.player_id
        old_sid = attacker.sid
        room.phase = GamePhase.NIGHT
        room.pending_prompt = PendingPrompt(PromptType.KILL_REACTION, target.sid, {
            "attacker_sid": old_sid,
            "options": ["none"],
        })

        self.clients[0].disconnect()
        replacement = server.socketio.test_client(
            server.app, flask_test_client=server.app.test_client()
        )
        self.clients.append(replacement)
        replacement.emit("reconnect_player", {"player_id": player_id})

        self.assertEqual(attacker.sid, room.pending_prompt.data["attacker_sid"])

    def test_successful_card_play_advances_and_refreshes_private_state(self):
        self.clients[0].emit("create_room", {"name": "Host", "avatar": 1})
        code = next(iter(server.game_rooms))
        self.clients[1].emit("join_room", {
            "room_code": code,
            "name": "Target",
            "avatar": 2,
        })
        room = server.game_rooms[code]
        actor, target = room.players
        actor.house_card = HouseCard(HouseType.LOTUS, 1)
        target.house_card = HouseCard(HouseType.CRANE, 1)
        spy = Card(CardType.SPY, rank=1, number=1)
        actor.hand = [spy]
        room.phase = GamePhase.NIGHT
        room.current_rank = 1
        room.night_stage = "resolving"
        room.night_action_queue = [{
            "priority": (1, 0),
            "sid": actor.sid,
            "card": spy,
        }]

        self.clients[0].emit("play_card", {
            "room_code": code,
            "card_id": spy.id,
            "target_sid": target.sid,
        })

        self.assertNotIn(spy, actor.hand)
        self.assertEqual(2, room.current_rank)
        self.assertEqual("committing", room.night_stage)
        self.assertEqual(
            HouseType.CRANE,
            actor.known_houses[target.player_id].house,
        )


if __name__ == "__main__":
    unittest.main()
