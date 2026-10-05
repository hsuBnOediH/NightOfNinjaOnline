import unittest

from game.engine import GameEngine
from game.models import (
    Card,
    CardType,
    GamePhase,
    GameRoom,
    HouseCard,
    HouseType,
    PendingPrompt,
    Player,
    PromptType,
    TricksterVariant,
    create_card_deck,
    create_score_pool,
)


def make_room(count=4):
    room = GameRoom("TEST", "sid-0")
    room.players = [Player(f"sid-{i}", f"P{i}", i + 1) for i in range(count)]
    return room


class SetupTests(unittest.TestCase):
    def test_physical_components_match_rulebook(self):
        deck = create_card_deck()
        self.assertEqual(33, len(deck))
        for card_type in (
            CardType.SPY,
            CardType.MYSTIC,
            CardType.TRICKSTER,
            CardType.ASSASSIN,
            CardType.SHINOBI,
        ):
            cards = [card for card in deck if card.card_type == card_type]
            self.assertEqual([1, 2, 3, 4, 5, 6], sorted(card.number for card in cards))
        self.assertEqual(35, len(create_score_pool()))

    def test_normal_mode_minimum_is_four(self):
        self.assertEqual(4, GameRoom.MIN_PLAYERS)

    def test_odd_player_count_adds_exactly_one_ronin(self):
        room = make_room(5)
        GameEngine.assign_houses(room)
        houses = [player.house_card.house for player in room.players]
        self.assertEqual(2, houses.count(HouseType.LOTUS))
        self.assertEqual(2, houses.count(HouseType.CRANE))
        self.assertEqual(1, houses.count(HouseType.RONIN))


class SimultaneousNightTests(unittest.TestCase):
    def setUp(self):
        self.room = make_room(4)
        GameEngine.start_round(self.room)
        self.room.phase = GamePhase.NIGHT
        self.room.current_rank = 1
        self.room.night_stage = "committing"

    def test_cards_are_not_revealed_until_everyone_commits(self):
        first = Card(CardType.SPY, rank=1, number=5)
        second = Card(CardType.SPY, rank=1, number=2)
        self.room.players[0].hand = [first]
        self.room.players[1].hand = [second]

        ok, _ = GameEngine.commit_phase_cards(self.room, "sid-0", [first.id])
        self.assertTrue(ok)
        self.assertFalse(GameEngine.phase_commit_complete(self.room))
        self.assertEqual([], self.room.night_action_queue)

        for player in self.room.players[1:]:
            selected = [second.id] if player.sid == "sid-1" else []
            self.assertTrue(GameEngine.commit_phase_cards(self.room, player.sid, selected)[0])

        queue = GameEngine.finalize_phase_commitments(self.room)
        self.assertEqual([second.id, first.id], [action["card"].id for action in queue])
        self.assertEqual("resolving", self.room.night_stage)

    def test_duplicate_or_wrong_rank_commit_is_rejected(self):
        spy = Card(CardType.SPY, rank=1, number=1)
        mystic = Card(CardType.MYSTIC, rank=2, number=1)
        self.room.players[0].hand = [spy, mystic]
        self.assertFalse(GameEngine.commit_phase_cards(
            self.room, "sid-0", [spy.id, spy.id]
        )[0])
        self.assertFalse(GameEngine.commit_phase_cards(
            self.room, "sid-0", [mystic.id]
        )[0])

    def test_dead_owner_loses_revealed_action(self):
        card = Card(CardType.SPY, rank=1, number=3)
        player = self.room.players[0]
        player.hand = [card]
        self.room.night_stage = "resolving"
        self.room.night_action_queue = [{
            "priority": (3, 0), "sid": player.sid, "card": card,
        }]
        player.alive = False

        self.assertIsNone(GameEngine.get_current_action(self.room))
        self.assertNotIn(card, player.hand)
        self.assertIn(card, self.room.discard_pile)


class CardRuleTests(unittest.TestCase):
    def setUp(self):
        self.room = make_room(4)
        GameEngine.start_round(self.room)
        self.room.phase = GamePhase.NIGHT
        self.actor, self.target = self.room.players[:2]

    def test_invalid_target_does_not_consume_card(self):
        spy = Card(CardType.SPY, rank=1, number=1)
        self.actor.hand = [spy]
        result = GameEngine.execute_card(
            self.room, self.actor.sid, spy, self.actor.sid
        )
        self.assertFalse(result["success"])
        self.assertIn(spy, self.actor.hand)

    def test_assassin_and_shinobi_may_target_self_as_printed(self):
        assassin = Card(CardType.ASSASSIN, rank=4, number=1)
        self.actor.hand = [assassin]
        result = GameEngine.execute_card(
            self.room, self.actor.sid, assassin, self.actor.sid
        )
        self.assertTrue(result["success"])
        self.assertFalse(self.actor.alive)

        self.actor.alive = True
        shinobi = Card(CardType.SHINOBI, rank=5, number=1)
        self.actor.hand = [shinobi]
        result = GameEngine.execute_card(
            self.room, self.actor.sid, shinobi, self.actor.sid
        )
        self.assertTrue(result["success"])
        self.assertEqual(PromptType.SHINOBI_DECISION, self.room.pending_prompt.prompt_type)

    def test_shapeshifter_hides_new_identities(self):
        self.actor.house_card = HouseCard(HouseType.LOTUS, 1)
        self.target.house_card = HouseCard(HouseType.CRANE, 2)
        self.actor.known_house_card = HouseCard(HouseType.LOTUS, 1)
        self.target.known_house_card = HouseCard(HouseType.CRANE, 2)
        self.actor.house_revealed = True
        self.target.house_revealed = True
        card = Card(
            CardType.TRICKSTER,
            rank=3,
            number=1,
            variant=TricksterVariant.SHAPESHIFTER.value,
        )
        self.actor.hand = [card]
        result = GameEngine.execute_card(
            self.room,
            self.actor.sid,
            card,
            self.actor.sid,
            {"extra_target_sid": self.target.sid},
        )
        self.assertTrue(result["success"])
        swap_result = GameEngine.resolve_shapeshifter_swap(self.room, True)
        self.assertEqual(HouseType.CRANE, self.actor.house_card.house)
        self.assertEqual(HouseType.LOTUS, self.actor.known_house_card.house)
        self.assertEqual(
            HouseType.CRANE,
            self.actor.known_houses[self.actor.player_id].house,
        )
        self.assertEqual(
            HouseType.LOTUS,
            self.actor.known_houses[self.target.player_id].house,
        )
        self.assertEqual(2, sum(
            effect["type"] == "reveal_house"
            for effect in swap_result["effects"]
        ))
        self.assertFalse(self.actor.house_revealed)
        self.assertFalse(self.target.house_revealed)

    def test_soul_merchant_swaps_selected_tokens(self):
        self.actor.score_tokens = [2, 4]
        self.target.score_tokens = [3, 2]
        self.room.pending_prompt = PendingPrompt(
            PromptType.SOUL_MERCHANT_SWAP,
            self.actor.sid,
            {"target_sid": self.target.sid},
        )
        result = GameEngine.resolve_soul_merchant_swap(
            self.room, True, own_index=1, target_index=0
        )
        self.assertTrue(result["success"])
        self.assertEqual([2, 3], self.actor.score_tokens)
        self.assertEqual([4, 2], self.target.score_tokens)

    def test_graverobber_can_play_acquired_card_immediately(self):
        acquired = Card(CardType.SPY, rank=1, number=4)
        self.actor.hand = [acquired]
        self.room.current_rank = 3
        self.room.night_stage = "resolving"
        self.room.night_action_queue = []
        self.room.current_action_index = 0
        self.room.pending_prompt = PendingPrompt(
            PromptType.GRAVEROBBER_PLAY,
            self.actor.sid,
            {"card": acquired.to_dict(), "can_play_later": False},
        )
        result = GameEngine.resolve_graverobber_play(self.room, True)
        self.assertTrue(result["success"])
        self.assertEqual(acquired.id, self.room.night_action_queue[0]["card"].id)


class ScoringTests(unittest.TestCase):
    def setUp(self):
        self.room = make_room(4)
        for player in self.room.players:
            player.alive = True
        self.room.players[0].house_card = HouseCard(HouseType.LOTUS, 1)
        self.room.players[1].house_card = HouseCard(HouseType.LOTUS, 2)
        self.room.players[2].house_card = HouseCard(HouseType.CRANE, 1)
        self.room.players[3].house_card = HouseCard(HouseType.CRANE, 2)

    def test_complete_tie_scores_only_survivors(self):
        self.room.players[1].alive = False
        self.room.players[3].alive = False
        outcome = GameEngine.determine_winner(self.room)
        self.assertTrue(outcome.full_tie)
        self.assertEqual(
            {"sid-0", "sid-2"},
            {player.sid for player in outcome.scoring_players},
        )

    def test_ordinary_house_win_scores_dead_house_members(self):
        self.room.players[1].alive = False
        self.room.players[2].alive = False
        self.room.players[3].alive = True
        outcome = GameEngine.determine_winner(self.room)
        self.assertEqual(HouseType.LOTUS, outcome.winning_house)
        self.assertEqual(
            {"sid-0", "sid-1"},
            {player.sid for player in outcome.scoring_players},
        )

    def test_joint_game_winners_are_preserved(self):
        self.room.winning_threshold = 10
        self.room.players[0].score_tokens = [4, 3, 3]
        self.room.players[1].score_tokens = [2, 4, 4]
        self.room.players[2].score_tokens = [4, 3, 2]
        winners = GameEngine.check_game_over(self.room)
        self.assertEqual({"sid-0", "sid-1"}, {player.sid for player in winners})

    def test_ronin_mastermind_scores_alone(self):
        ronin = self.room.players[0]
        ronin.house_card = HouseCard(HouseType.RONIN, 0)
        ronin.hand = [Card(CardType.MASTERMIND)]
        outcome = GameEngine.determine_winner(self.room)
        self.assertIsNone(outcome.winning_house)
        self.assertEqual([ronin], outcome.ronin_winners)
        self.assertEqual([], outcome.faction_winners)


if __name__ == "__main__":
    unittest.main()
