"""
Night of Ninja Online - Game Engine
Core logic: house assignment, drafting, night-phase execution, scoring.
"""

from typing import List, Dict, Optional, Tuple, Any
import random
from game.models import (
    GameRoom, Player, Card, HouseCard, HouseType, CardType,
    TricksterVariant, GamePhase, PromptType, PendingPrompt,
    create_card_deck, create_score_pool,
)


class GameEngine:
    """All methods are static – no mutable engine state."""

    # ╔══════════════════════════════════════════════════════════════════════╗
    # ║  SETUP                                                              ║
    # ╚══════════════════════════════════════════════════════════════════════╝

    @staticmethod
    def assign_houses(room: GameRoom):
        n = len(room.players)
        houses: List[HouseCard] = []

        if n % 2 == 0:
            half = n // 2
            for i in range(half):
                houses.append(HouseCard(HouseType.LOTUS, i + 1))
            for i in range(half):
                houses.append(HouseCard(HouseType.CRANE, i + 1))
        else:
            half = (n - 1) // 2
            for i in range(half):
                houses.append(HouseCard(HouseType.LOTUS, i + 1))
            for i in range(half):
                houses.append(HouseCard(HouseType.CRANE, i + 1))
            houses.append(HouseCard(HouseType.RONIN, 0))

        random.shuffle(houses)
        for player, house in zip(room.players, houses):
            player.house_card = house

    @staticmethod
    def start_round(room: GameRoom):
        """Reset state and begin a new round."""
        room.round_number += 1
        room.round_log = []
        room.discard_pile = []
        room.current_rank = 0
        room.night_action_queue = []
        room.current_action_index = 0
        room.pending_prompt = None
        room.draft_state = {}

        for p in room.players:
            p.alive = True
            p.hand = []
            p.played_cards = []
            p.house_revealed = False

        GameEngine.assign_houses(room)

        if not room.score_pool:
            room.score_pool = create_score_pool()

    # ╔══════════════════════════════════════════════════════════════════════╗
    # ║  DRAFTING                                                           ║
    # ╚══════════════════════════════════════════════════════════════════════╝

    @staticmethod
    def start_draft(room: GameRoom) -> Dict[str, List[Card]]:
        room.phase = GamePhase.DRAFTING
        deck = create_card_deck()
        random.shuffle(deck)

        draft_hands: Dict[str, List[Card]] = {}
        for i, player in enumerate(room.players):
            draft_hands[player.sid] = deck[i * 3:(i + 1) * 3]

        room.draft_state = {
            'round': 1,
            'hands': draft_hands,
            'selections': {},
        }
        return draft_hands

    @staticmethod
    def process_draft_selection(room: GameRoom, player_sid: str, card_index: int) -> bool:
        """Returns True when every player has selected (triggers advance)."""
        hands = room.draft_state.get('hands', {})
        if player_sid not in hands:
            return False
        hand = hands[player_sid]
        if card_index < 0 or card_index >= len(hand):
            return False
        if player_sid in room.draft_state.get('selections', {}):
            return False

        room.draft_state['selections'][player_sid] = {
            'card': hand[card_index],
            'index': card_index,
        }

        # Auto-select for disconnected players
        for p in room.players:
            if not p.connected and p.sid in hands and p.sid not in room.draft_state['selections']:
                room.draft_state['selections'][p.sid] = {
                    'card': hands[p.sid][0],
                    'index': 0,
                }

        if len(room.draft_state['selections']) == len(room.players):
            GameEngine._advance_draft(room)
            return True
        return False

    @staticmethod
    def _advance_draft(room: GameRoom):
        dr = room.draft_state['round']
        hands = room.draft_state['hands']
        sels = room.draft_state['selections']

        # Give selected cards to players
        for sid, sel in sels.items():
            p = room.get_player_by_sid(sid)
            if p:
                p.hand.append(sel['card'])

        if dr == 2:
            # Discard remaining cards, finish drafting
            for sid, sel in sels.items():
                remaining = [c for i, c in enumerate(hands[sid]) if i != sel['index']]
                room.discard_pile.extend(remaining)
            GameEngine._init_night_phase(room)
        else:
            # Pass remaining 2 cards to the left
            sids = [p.sid for p in room.players]
            new_hands: Dict[str, List[Card]] = {}
            for i, sid in enumerate(sids):
                remaining = [c for j, c in enumerate(hands[sid]) if j != sels[sid]['index']]
                next_sid = sids[(i + 1) % len(sids)]
                new_hands[next_sid] = remaining
            room.draft_state = {'round': 2, 'hands': new_hands, 'selections': {}}

    # ╔══════════════════════════════════════════════════════════════════════╗
    # ║  NIGHT PHASE – queue management                                     ║
    # ╚══════════════════════════════════════════════════════════════════════╝

    @staticmethod
    def _init_night_phase(room: GameRoom):
        room.phase = GamePhase.NIGHT
        room.draft_state = {}
        room.night_action_queue = []

        for player in room.players:
            for card in player.hand:
                if card.rank is not None:
                    room.night_action_queue.append({
                        'priority': (card.rank, card.number or 0),
                        'sid': player.sid,
                        'card': card,
                    })

        room.night_action_queue.sort(key=lambda x: x['priority'])
        room.current_action_index = 0
        if room.night_action_queue:
            room.current_rank = room.night_action_queue[0]['priority'][0]

    @staticmethod
    def get_current_action(room: GameRoom) -> Optional[Dict]:
        """Return the next valid action, skipping dead or disconnected players."""
        while room.current_action_index < len(room.night_action_queue):
            action = room.night_action_queue[room.current_action_index]
            player = room.get_player_by_sid(action['sid'])
            if player and player.alive and player.connected:
                return action
            room.current_action_index += 1
        return None

    # ╔══════════════════════════════════════════════════════════════════════╗
    # ║  CARD EXECUTION (main dispatcher)                                   ║
    # ╚══════════════════════════════════════════════════════════════════════╝

    @staticmethod
    def execute_card(room: GameRoom, player_sid: str, card: Card,
                     target_sid: Optional[str] = None,
                     extra_data: Optional[Dict] = None) -> Dict[str, Any]:
        player = room.get_player_by_sid(player_sid)
        target = room.get_player_by_sid(target_sid) if target_sid else None
        extra = extra_data or {}

        ct = card.card_type
        if ct == CardType.SPY:
            result = GameEngine._exec_spy(player, target)
        elif ct == CardType.MYSTIC:
            result = GameEngine._exec_mystic(player, target)
        elif ct == CardType.ASSASSIN:
            result = GameEngine._exec_assassin(room, player, target)
        elif ct == CardType.SHINOBI:
            result = GameEngine._exec_shinobi(room, player, target)
        elif ct == CardType.TRICKSTER:
            result = GameEngine._exec_trickster(room, player, target, card, extra)
        else:
            result = _ok(f"{player.name} 打出了 {ct.value}")

        # Move card from hand → played / discard
        player.remove_card(card)
        player.played_cards.append(card)
        room.discard_pile.append(card)

        return result

    # ────────────────── individual card executors ─────────────────────────

    @staticmethod
    def _exec_spy(player: Player, target: Optional[Player]) -> Dict:
        if not target:
            return _fail("需要选择一个目标")
        return _ok(
            message=f"你查看了 {target.name} 的身份",
            public=f"{player.name} 对 {target.name} 使用了密探",
            effects=[{
                'type': 'reveal_house',
                'target_sid': target.sid,
                'target_name': target.name,
                'house': target.house_card.to_dict(),
            }],
        )

    @staticmethod
    def _exec_mystic(player: Player, target: Optional[Player]) -> Dict:
        if not target:
            return _fail("需要选择一个目标")
        effects: List[Dict] = [{
            'type': 'reveal_house',
            'target_sid': target.sid,
            'target_name': target.name,
            'house': target.house_card.to_dict(),
        }]
        if target.hand:
            rc = random.choice(target.hand)
            effects.append({
                'type': 'reveal_hand_card',
                'target_sid': target.sid,
                'target_name': target.name,
                'card': rc.to_dict(),
            })
        return _ok(
            message=f"你查看了 {target.name} 的身份和手牌",
            public=f"{player.name} 对 {target.name} 使用了隐士",
            effects=effects,
        )

    @staticmethod
    def _exec_assassin(room: GameRoom, player: Player, target: Optional[Player]) -> Dict:
        if not target:
            return _fail("需要选择一个目标")
        if not target.alive:
            return _fail("目标已死亡")

        has_mirror = target.has_card_type(CardType.MIRROR_MONK)
        has_martyr = target.has_card_type(CardType.MARTYR)

        if has_mirror or has_martyr:
            opts = []
            if has_mirror:
                opts.append('mirror_monk')
            if has_martyr:
                opts.append('martyr')
            opts.append('none')
            room.pending_prompt = PendingPrompt(PromptType.KILL_REACTION, target.sid, {
                'attacker_sid': player.sid,
                'attacker_name': player.name,
                'attack_type': 'assassin',
                'options': opts,
            })
            return _ok(
                message=f"你对 {target.name} 发动了刺杀，等待对方反应…",
                public=f"{player.name} 对 {target.name} 使用了盲眼刺客！",
                effects=[{'type': 'pending_reaction', 'target_sid': target.sid}],
            )

        target.alive = False
        return _ok(
            message=f"你刺杀了 {target.name}",
            public=f"{player.name} 刺杀了 {target.name}！",
            effects=[{'type': 'kill', 'target_sid': target.sid, 'target_name': target.name}],
        )

    @staticmethod
    def _exec_shinobi(room: GameRoom, player: Player, target: Optional[Player]) -> Dict:
        if not target:
            return _fail("需要选择一个目标")

        effects: List[Dict] = [{
            'type': 'reveal_house',
            'target_sid': target.sid,
            'target_name': target.name,
            'house': target.house_card.to_dict(),
        }]

        if target.alive:
            room.pending_prompt = PendingPrompt(PromptType.SHINOBI_DECISION, player.sid, {
                'target_sid': target.sid,
                'target_name': target.name,
                'target_house': target.house_card.to_dict(),
            })
            return _ok(
                message=f"你查看了 {target.name} 的身份，请决定是否击杀",
                public=f"{player.name} 对 {target.name} 使用了上忍",
                effects=effects,
            )

        return _ok(
            message=f"你查看了 {target.name} 的身份（目标已死亡）",
            public=f"{player.name} 对 {target.name} 使用了上忍",
            effects=effects,
        )

    # ────────────────── trickster variants ────────────────────────────────

    @staticmethod
    def _exec_trickster(room: GameRoom, player: Player,
                        target: Optional[Player], card: Card,
                        extra: Dict) -> Dict:
        v = card.variant

        # ── #1 百变者 Shapeshifter ───────────────────────────────────────
        if v == TricksterVariant.SHAPESHIFTER.value:
            extra_sid = extra.get('extra_target_sid')
            t2 = room.get_player_by_sid(extra_sid) if extra_sid else None
            if not target or not t2:
                return _fail("需要选择两个目标")
            effects: List[Dict] = [
                {'type': 'reveal_house', 'target_sid': target.sid,
                 'target_name': target.name, 'house': target.house_card.to_dict()},
                {'type': 'reveal_house', 'target_sid': t2.sid,
                 'target_name': t2.name, 'house': t2.house_card.to_dict()},
            ]
            room.pending_prompt = PendingPrompt(PromptType.SHAPESHIFTER_SWAP, player.sid, {
                'target1_sid': target.sid, 'target1_name': target.name,
                'target2_sid': t2.sid, 'target2_name': t2.name,
            })
            return _ok(
                message=f"你查看了 {target.name} 和 {t2.name} 的身份，是否互换？",
                public=f"{player.name} 使用了百变者",
                effects=effects,
            )

        # ── #2 掘墓人 Graverobber ────────────────────────────────────────
        if v == TricksterVariant.GRAVEROBBER.value:
            if not room.discard_pile:
                return _ok("弃牌堆为空", f"{player.name} 使用了掘墓人（弃牌堆为空）")
            avail = room.discard_pile[-2:] if len(room.discard_pile) >= 2 else room.discard_pile[:]
            if len(avail) == 1:
                c = avail[0]
                room.discard_pile.remove(c)
                player.hand.append(c)
                GameEngine._inject_into_queue(room, player, c)
                return _ok(f"你从弃牌堆获得了一张卡牌", f"{player.name} 使用了掘墓人",
                           [{'type': 'card_gained', 'card': c.to_dict()}])
            room.pending_prompt = PendingPrompt(PromptType.GRAVEROBBER_PICK, player.sid, {
                'cards': [c.to_dict() for c in avail],
                'card_ids': [c.id for c in avail],
            })
            return _ok("选择要拿走的卡牌", f"{player.name} 使用了掘墓人")

        # ── #3 捣蛋鬼 Troublemaker ───────────────────────────────────────
        if v == TricksterVariant.TROUBLEMAKER.value:
            if not target:
                return _fail("需要选择一个目标")
            effects = [{'type': 'reveal_house', 'target_sid': target.sid,
                        'target_name': target.name, 'house': target.house_card.to_dict()}]
            room.pending_prompt = PendingPrompt(PromptType.TROUBLEMAKER_REVEAL, player.sid, {
                'target_sid': target.sid, 'target_name': target.name,
                'target_house': target.house_card.to_dict(),
            })
            return _ok(f"你查看了 {target.name} 的身份，是否公开？",
                       f"{player.name} 对 {target.name} 使用了捣蛋鬼", effects)

        # ── #4 灵魂商贩 Soul Merchant ────────────────────────────────────
        if v == TricksterVariant.SOUL_MERCHANT.value:
            if not target:
                return _fail("需要选择一个目标")
            room.pending_prompt = PendingPrompt(PromptType.SOUL_MERCHANT_CHOICE, player.sid, {
                'target_sid': target.sid, 'target_name': target.name,
            })
            return _ok("选择查看目标的身份还是分数",
                       f"{player.name} 对 {target.name} 使用了灵魂商贩")

        # ── #5 窃贼 Thief ────────────────────────────────────────────────
        if v == TricksterVariant.THIEF.value:
            player.house_revealed = True
            reveal_eff: Dict = {
                'type': 'reveal_house_public', 'target_sid': player.sid,
                'target_name': player.name, 'house': player.house_card.to_dict(),
            }
            if not target:
                return _fail("需要选择一个目标")
            if len(target.score_tokens) > len(player.score_tokens) and target.score_tokens:
                token = target.score_tokens.pop()
                player.score_tokens.append(token)
                return _ok(f"你偷取了 {target.name} 的一枚分数（{token}分）",
                           f"{player.name}（窃贼）偷取了 {target.name} 的分数",
                           [reveal_eff, {'type': 'steal_score', 'from': target.sid, 'to': player.sid}])
            return _ok(f"{target.name} 的分数指示物不比你多，偷窃失败",
                       f"{player.name}（窃贼）尝试偷窃失败", [reveal_eff])

        # ── #6 裁判 Judge ────────────────────────────────────────────────
        if v == TricksterVariant.JUDGE.value:
            player.house_revealed = True
            effs: List[Dict] = [{
                'type': 'reveal_house_public', 'target_sid': player.sid,
                'target_name': player.name, 'house': player.house_card.to_dict(),
            }]
            if target and target.alive:
                target.alive = False
                effs.append({'type': 'kill', 'target_sid': target.sid,
                             'target_name': target.name, 'unblockable': True})
                return _ok(f"你处决了 {target.name}（无法防御）",
                           f"{player.name}（裁判）处决了 {target.name}！此击杀无法被防御！", effs)
            return _ok("目标无效", f"{player.name}（裁判）揭示了身份", effs)

        return _fail("未知骗徒类型")

    # ╔══════════════════════════════════════════════════════════════════════╗
    # ║  PROMPT RESOLVERS                                                   ║
    # ╚══════════════════════════════════════════════════════════════════════╝

    @staticmethod
    def resolve_kill_reaction(room: GameRoom, reaction: str) -> Dict[str, Any]:
        prompt = room.pending_prompt
        if not prompt or prompt.prompt_type != PromptType.KILL_REACTION:
            return _fail("无待处理的反应")

        attacker = room.get_player_by_sid(prompt.data['attacker_sid'])
        target = room.get_player_by_sid(prompt.target_sid)
        room.pending_prompt = None

        if reaction == 'mirror_monk' and target and target.has_card_type(CardType.MIRROR_MONK):
            mc = target.get_card_of_type(CardType.MIRROR_MONK)
            target.remove_card(mc)
            target.played_cards.append(mc)
            room.discard_pile.append(mc)
            if attacker:
                attacker.alive = False
            msg = f"{target.name} 使用经施僧反杀了 {attacker.name if attacker else '???'}！"
            return _ok(msg, msg, [{'type': 'kill_reflected',
                                   'dead_sid': attacker.sid if attacker else '',
                                   'reflector_sid': target.sid}])

        if reaction == 'martyr' and target and target.has_card_type(CardType.MARTYR):
            mc = target.get_card_of_type(CardType.MARTYR)
            target.remove_card(mc)
            target.played_cards.append(mc)
            room.discard_pile.append(mc)
            target.alive = False
            token_msg = ""
            if room.score_pool:
                tk = room.score_pool.pop()
                target.score_tokens.append(tk)
                token_msg = f"，获得 {tk} 分"
            msg = f"{target.name} 使用殉道者，虽然死亡但获得了分数{token_msg}！"
            return _ok(msg, f"{target.name} 使用了殉道者！",
                       [{'type': 'martyr_death', 'target_sid': target.sid}])

        # No reaction → straight kill
        if target:
            target.alive = False
        msg = f"{target.name if target else '???'} 被杀死了"
        return _ok(msg, msg, [{'type': 'kill', 'target_sid': target.sid if target else ''}])

    @staticmethod
    def resolve_shinobi_decision(room: GameRoom, kill: bool) -> Dict[str, Any]:
        prompt = room.pending_prompt
        if not prompt or prompt.prompt_type != PromptType.SHINOBI_DECISION:
            return _fail("无待处理的决定")

        shinobi = room.get_player_by_sid(prompt.target_sid)
        target = room.get_player_by_sid(prompt.data['target_sid'])
        room.pending_prompt = None

        if not kill:
            return _ok(f"你放过了 {target.name if target else '???'}",
                       f"{shinobi.name if shinobi else '???'} 查看后选择放过")

        if not target or not target.alive:
            return _ok("目标已死亡", f"{shinobi.name if shinobi else ''} 的上忍目标已死亡")

        # Check for reactive cards
        has_mirror = target.has_card_type(CardType.MIRROR_MONK)
        has_martyr = target.has_card_type(CardType.MARTYR)

        if has_mirror or has_martyr:
            opts = []
            if has_mirror:
                opts.append('mirror_monk')
            if has_martyr:
                opts.append('martyr')
            opts.append('none')
            room.pending_prompt = PendingPrompt(PromptType.KILL_REACTION, target.sid, {
                'attacker_sid': shinobi.sid if shinobi else '',
                'attacker_name': shinobi.name if shinobi else '',
                'attack_type': 'shinobi',
                'options': opts,
            })
            return _ok(f"等待 {target.name} 的反应…",
                       f"{shinobi.name if shinobi else ''}（上忍）选择击杀 {target.name}！",
                       [{'type': 'pending_reaction', 'target_sid': target.sid}])

        target.alive = False
        return _ok(f"你击杀了 {target.name}",
                   f"{shinobi.name if shinobi else ''}（上忍）击杀了 {target.name}！",
                   [{'type': 'kill', 'target_sid': target.sid, 'target_name': target.name}])

    @staticmethod
    def resolve_graverobber_pick(room: GameRoom, card_id: str) -> Dict[str, Any]:
        prompt = room.pending_prompt
        if not prompt or prompt.prompt_type != PromptType.GRAVEROBBER_PICK:
            return _fail("无待处理的选择")

        player = room.get_player_by_sid(prompt.target_sid)
        room.pending_prompt = None

        if not player:
            return _fail("玩家不存在")

        chosen = None
        for c in room.discard_pile:
            if c.id == card_id:
                chosen = c
                break
        if not chosen:
            return _fail("无效的卡牌选择")

        room.discard_pile.remove(chosen)
        player.hand.append(chosen)
        GameEngine._inject_into_queue(room, player, chosen)

        return _ok(f"你获得了一张卡牌", "",
                   [{'type': 'card_gained', 'card': chosen.to_dict()}])

    @staticmethod
    def resolve_troublemaker_reveal(room: GameRoom, reveal: bool) -> Dict[str, Any]:
        prompt = room.pending_prompt
        if not prompt or prompt.prompt_type != PromptType.TROUBLEMAKER_REVEAL:
            return _fail("无待处理的决定")

        target = room.get_player_by_sid(prompt.data['target_sid'])
        room.pending_prompt = None

        if reveal and target:
            target.house_revealed = True
            return _ok(f"你公开揭示了 {target.name} 的身份！",
                       f"{target.name} 的身份被公开揭示！",
                       [{'type': 'reveal_house_public', 'target_sid': target.sid,
                         'target_name': target.name, 'house': target.house_card.to_dict()}])
        return _ok("你选择不公开揭示", "")

    @staticmethod
    def resolve_soul_merchant_choice(room: GameRoom, choice: str) -> Dict[str, Any]:
        prompt = room.pending_prompt
        if not prompt or prompt.prompt_type != PromptType.SOUL_MERCHANT_CHOICE:
            return _fail("无待处理的选择")

        player = room.get_player_by_sid(prompt.target_sid)
        target = room.get_player_by_sid(prompt.data['target_sid'])
        room.pending_prompt = None

        if not player or not target:
            return _fail("玩家不存在")

        effects: List[Dict] = []
        msg = ""

        if choice == 'house':
            effects.append({'type': 'reveal_house', 'target_sid': target.sid,
                            'target_name': target.name, 'house': target.house_card.to_dict()})
            msg = f"你查看了 {target.name} 的身份"
        else:
            effects.append({'type': 'reveal_scores', 'target_sid': target.sid,
                            'target_name': target.name,
                            'scores': list(target.score_tokens),
                            'total': target.total_score()})
            msg = f"你查看了 {target.name} 的分数"

        if player.score_tokens and target.score_tokens:
            room.pending_prompt = PendingPrompt(PromptType.SOUL_MERCHANT_SWAP, player.sid, {
                'target_sid': target.sid, 'target_name': target.name,
            })
        return _ok(msg, "", effects)

    @staticmethod
    def resolve_soul_merchant_swap(room: GameRoom, do_swap: bool) -> Dict[str, Any]:
        prompt = room.pending_prompt
        if not prompt or prompt.prompt_type != PromptType.SOUL_MERCHANT_SWAP:
            return _fail("无待处理的交换")

        player = room.get_player_by_sid(prompt.target_sid)
        target = room.get_player_by_sid(prompt.data['target_sid'])
        room.pending_prompt = None

        if do_swap and player and target and player.score_tokens and target.score_tokens:
            pi = random.randint(0, len(player.score_tokens) - 1)
            ti = random.randint(0, len(target.score_tokens) - 1)
            player.score_tokens[pi], target.score_tokens[ti] = \
                target.score_tokens[ti], player.score_tokens[pi]
            return _ok(f"你与 {target.name} 交换了一枚分数",
                       f"灵魂商贩完成了分数交换",
                       [{'type': 'swap_score'}])
        return _ok("你选择不交换分数", "")

    @staticmethod
    def resolve_shapeshifter_swap(room: GameRoom, do_swap: bool) -> Dict[str, Any]:
        prompt = room.pending_prompt
        if not prompt or prompt.prompt_type != PromptType.SHAPESHIFTER_SWAP:
            return _fail("无待处理的交换")

        t1 = room.get_player_by_sid(prompt.data['target1_sid'])
        t2 = room.get_player_by_sid(prompt.data['target2_sid'])
        room.pending_prompt = None

        if do_swap and t1 and t2:
            t1.house_card, t2.house_card = t2.house_card, t1.house_card
            return _ok(f"你互换了 {t1.name} 和 {t2.name} 的身份",
                       "百变者互换了两名玩家的身份！",
                       [{'type': 'swap_identity', 't1': t1.sid, 't2': t2.sid}])
        return _ok("你选择不互换身份", "")

    # ╔══════════════════════════════════════════════════════════════════════╗
    # ║  SCORING                                                            ║
    # ╚══════════════════════════════════════════════════════════════════════╝

    @staticmethod
    def determine_winner(room: GameRoom) -> Tuple[Optional[HouseType], List[Player], List[Player]]:
        """
        Returns (winning_house, winning_faction_members, ronin_winners).
        winning_faction_members includes ALL members (alive or dead).
        """
        alive = room.get_alive_players()
        if not alive:
            return None, [], []

        ronin_alive = [p for p in alive if p.house_card.house == HouseType.RONIN]

        # ── Mastermind override ──────────────────────────────────────────
        for p in alive:
            if any(c.card_type == CardType.MASTERMIND for c in p.hand):
                if p.house_card.house == HouseType.RONIN:
                    # No faction wins, only ronin scores
                    return None, [], [p]
                wh = p.house_card.house
                return wh, room.get_players_by_house(wh), ronin_alive

        # ── Rank comparison ──────────────────────────────────────────────
        lotus_alive = [p for p in alive if p.house_card.house == HouseType.LOTUS]
        crane_alive = [p for p in alive if p.house_card.house == HouseType.CRANE]

        lotus_ranks = sorted([p.house_card.number for p in lotus_alive]) if lotus_alive else []
        crane_ranks = sorted([p.house_card.number for p in crane_alive]) if crane_alive else []

        if not lotus_ranks and not crane_ranks:
            return None, [], ronin_alive

        if not crane_ranks:
            wh = HouseType.LOTUS
        elif not lotus_ranks:
            wh = HouseType.CRANE
        else:
            wh = None
            ml = max(len(lotus_ranks), len(crane_ranks))
            for i in range(ml):
                lr = lotus_ranks[i] if i < len(lotus_ranks) else 999
                cr = crane_ranks[i] if i < len(crane_ranks) else 999
                if lr < cr:
                    wh = HouseType.LOTUS
                    break
                elif cr < lr:
                    wh = HouseType.CRANE
                    break
            if wh is None:
                # Full tie – all survivors share victory
                all_members = [p for p in room.players
                               if p.house_card.house in (HouseType.LOTUS, HouseType.CRANE)]
                return None, all_members, ronin_alive

        return wh, room.get_players_by_house(wh), ronin_alive

    @staticmethod
    def distribute_scores(room: GameRoom, winners: List[Player],
                          ronin_winners: List[Player]):
        """每位获胜阵营成员（含阵亡）盲抽1分，存活浪人盲抽1分。"""
        for p in winners:
            if room.score_pool:
                p.score_tokens.append(room.score_pool.pop())
        for p in ronin_winners:
            if room.score_pool:
                p.score_tokens.append(room.score_pool.pop())

    @staticmethod
    def check_game_over(room: GameRoom) -> Optional[Player]:
        candidates = [p for p in room.players if p.total_score() >= room.winning_threshold]
        if candidates:
            candidates.sort(key=lambda p: p.total_score(), reverse=True)
            return candidates[0]
        if not room.score_pool:
            # Pool exhausted – highest score wins
            best = max(room.players, key=lambda p: p.total_score())
            if best.total_score() > 0:
                return best
        return None

    # ╔══════════════════════════════════════════════════════════════════════╗
    # ║  HELPERS                                                            ║
    # ╚══════════════════════════════════════════════════════════════════════╝

    @staticmethod
    def _inject_into_queue(room: GameRoom, player: Player, card: Card):
        """Insert a newly-gained card into the night action queue if still playable."""
        if card.rank is None:
            return
        cur_action = GameEngine.get_current_action(room)
        cur_priority = cur_action['priority'] if cur_action else (999, 999)
        new_priority = (card.rank, card.number or 0)

        if new_priority <= cur_priority:
            return  # Phase already passed

        new_entry = {'priority': new_priority, 'sid': player.sid, 'card': card}
        idx = room.current_action_index + 1
        while idx < len(room.night_action_queue):
            if new_priority < room.night_action_queue[idx]['priority']:
                break
            idx += 1
        room.night_action_queue.insert(idx, new_entry)

    @staticmethod
    def auto_resolve_prompt(room: GameRoom) -> Optional[Dict[str, Any]]:
        """Auto-resolve a pending prompt with a safe default (for disconnected players)."""
        if not room.pending_prompt:
            return None
        pt = room.pending_prompt.prompt_type
        if pt == PromptType.KILL_REACTION:
            return GameEngine.resolve_kill_reaction(room, 'none')
        if pt == PromptType.SHINOBI_DECISION:
            return GameEngine.resolve_shinobi_decision(room, False)
        if pt == PromptType.GRAVEROBBER_PICK:
            ids = room.pending_prompt.data.get('card_ids', [])
            return GameEngine.resolve_graverobber_pick(room, ids[0] if ids else '')
        if pt == PromptType.TROUBLEMAKER_REVEAL:
            return GameEngine.resolve_troublemaker_reveal(room, False)
        if pt == PromptType.SOUL_MERCHANT_CHOICE:
            return GameEngine.resolve_soul_merchant_choice(room, 'house')
        if pt == PromptType.SOUL_MERCHANT_SWAP:
            return GameEngine.resolve_soul_merchant_swap(room, False)
        if pt == PromptType.SHAPESHIFTER_SWAP:
            return GameEngine.resolve_shapeshifter_swap(room, False)
        room.pending_prompt = None
        return None


# ─── tiny result helpers ─────────────────────────────────────────────────────

def _ok(message: str = "", public: str = "",
        effects: List[Dict] | None = None) -> Dict[str, Any]:
    return {
        'success': True,
        'message': message,
        'public_message': public or message,
        'effects': effects or [],
    }


def _fail(message: str) -> Dict[str, Any]:
    return {
        'success': False,
        'message': message,
        'public_message': '',
        'effects': [],
    }
