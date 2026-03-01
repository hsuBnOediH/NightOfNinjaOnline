"""
Night of Ninja Online - Data Models
Cards, players, rooms and game state
"""

from enum import Enum
from typing import List, Optional, Dict, Any
import random
import uuid


# ─── Enums ───────────────────────────────────────────────────────────────────

class HouseType(Enum):
    LOTUS = "lotus"    # 莲花 - 蓝
    CRANE = "crane"    # 仙鹤 - 红
    RONIN = "ronin"    # 浪人 - 紫


class CardType(Enum):
    SPY = "spy"                    # 密探 (Rank 1)
    MYSTIC = "mystic"              # 隐士 (Rank 2)
    TRICKSTER = "trickster"        # 骗徒 (Rank 3)
    ASSASSIN = "assassin"          # 盲眼刺客 (Rank 4)
    SHINOBI = "shinobi"            # 上忍 (Rank 5)
    MIRROR_MONK = "mirror_monk"    # 经施僧 (被动反杀)
    MARTYR = "martyr"              # 殉道者 (被动得分)
    MASTERMIND = "mastermind"      # 首脑 (被动胜利)


class TricksterVariant(Enum):
    SHAPESHIFTER = "shapeshifter"      # #1 百变者
    GRAVEROBBER = "graverobber"        # #2 掘墓人
    TROUBLEMAKER = "troublemaker"      # #3 捣蛋鬼
    SOUL_MERCHANT = "soul_merchant"    # #4 灵魂商贩
    THIEF = "thief"                    # #5 窃贼
    JUDGE = "judge"                    # #6 裁判


class GamePhase(Enum):
    LOBBY = "lobby"
    DRAFTING = "drafting"
    NIGHT = "night"
    REVEAL = "reveal"
    SCORING = "scoring"
    GAME_OVER = "game_over"


class PromptType(Enum):
    SHINOBI_DECISION = "shinobi_decision"
    KILL_REACTION = "kill_reaction"
    GRAVEROBBER_PICK = "graverobber_pick"
    TROUBLEMAKER_REVEAL = "troublemaker_reveal"
    SOUL_MERCHANT_CHOICE = "soul_merchant_choice"
    SOUL_MERCHANT_SWAP = "soul_merchant_swap"
    SHAPESHIFTER_SWAP = "shapeshifter_swap"


# ─── Card ────────────────────────────────────────────────────────────────────

class Card:
    """A ninja action card."""

    def __init__(self, card_type: CardType, rank: Optional[int] = None,
                 variant: Optional[str] = None, number: Optional[int] = None):
        self.id = str(uuid.uuid4())[:8]
        self.card_type = card_type
        self.rank = rank          # 1-5 for ranked cards, None for specials
        self.variant = variant    # TricksterVariant value string
        self.number = number      # Priority within same rank (lower = first)

    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'type': self.card_type.value,
            'rank': self.rank,
            'variant': self.variant,
            'number': self.number,
        }

    def __eq__(self, other):
        if not isinstance(other, Card):
            return False
        return self.id == other.id

    def __hash__(self):
        return hash(self.id)

    def __repr__(self):
        v = f", variant={self.variant}" if self.variant else ""
        return f"Card({self.card_type.value}, R{self.rank}, #{self.number}{v})"


# ─── HouseCard ───────────────────────────────────────────────────────────────

class HouseCard:
    """Faction identity card.  number: 1 = highest rank, larger = lower."""

    def __init__(self, house: HouseType, number: int):
        self.house = house
        self.number = number

    def to_dict(self) -> Dict:
        return {'house': self.house.value, 'number': self.number}


# ─── Player ──────────────────────────────────────────────────────────────────

class Player:
    """In-game player state."""

    def __init__(self, sid: str, name: str, avatar: int, player_id: str = ""):
        self.sid = sid
        self.player_id = player_id or str(uuid.uuid4())[:12]
        self.name = name
        self.avatar = avatar
        self.house_card: Optional[HouseCard] = None
        self.hand: List[Card] = []
        self.played_cards: List[Card] = []
        self.alive = True
        self.connected = True
        self.score_tokens: List[int] = []
        self.house_revealed = False

    # ── helpers ───────────────────────────────────────────────────────────

    def total_score(self) -> int:
        return sum(self.score_tokens)

    def has_card_type(self, ct: CardType) -> bool:
        return any(c.card_type == ct for c in self.hand)

    def get_card_of_type(self, ct: CardType) -> Optional[Card]:
        for c in self.hand:
            if c.card_type == ct:
                return c
        return None

    def find_card_by_id(self, card_id: str) -> Optional[Card]:
        for c in self.hand:
            if c.id == card_id:
                return c
        return None

    def remove_card(self, card: Card):
        self.hand = [c for c in self.hand if c.id != card.id]

    # ── serialisation ─────────────────────────────────────────────────────

    def to_dict(self, *, reveal_all: bool = False, for_self: bool = False) -> Dict:
        d: Dict[str, Any] = {
            'sid': self.sid,
            'name': self.name,
            'avatar': self.avatar,
            'alive': self.alive,
            'connected': self.connected,
            'score_count': len(self.score_tokens),
            'hand_count': len(self.hand),
            'house_revealed': self.house_revealed,
        }
        # Publicly-revealed house
        if self.house_revealed:
            d['house'] = self.house_card.to_dict() if self.house_card else None

        # Full reveal (end-of-round / game-over)
        if reveal_all:
            d['house'] = self.house_card.to_dict() if self.house_card else None
            d['total_score'] = self.total_score()
            d['score_tokens'] = list(self.score_tokens)
            d['hand'] = [c.to_dict() for c in self.hand]

        # Private view for the owning player
        if for_self and not reveal_all:
            d['total_score'] = self.total_score()
            d['score_tokens'] = list(self.score_tokens)
            d['hand'] = [c.to_dict() for c in self.hand]
            # house is sent separately at round start; don't leak post-swap
        return d


# ─── PendingPrompt ───────────────────────────────────────────────────────────

class PendingPrompt:
    """A decision a specific player must make before the game can continue."""

    def __init__(self, ptype: PromptType, target_sid: str, data: Dict[str, Any] | None = None):
        self.prompt_type = ptype
        self.target_sid = target_sid
        self.data = data or {}

    def to_dict(self) -> Dict:
        return {
            'type': self.prompt_type.value,
            'target_sid': self.target_sid,
            'data': self.data,
        }


# ─── GameRoom ────────────────────────────────────────────────────────────────

class GameRoom:
    """Complete state for one game room."""

    MAX_PLAYERS = 11
    MIN_PLAYERS = 3

    def __init__(self, room_code: str, host_sid: str):
        self.room_code = room_code
        self.host_sid = host_sid
        self.players: List[Player] = []
        self.phase = GamePhase.LOBBY
        self.round_number = 0
        self.current_rank = 0
        self.score_pool: List[int] = []
        self.discard_pile: List[Card] = []
        self.draft_state: Dict = {}
        self.winning_threshold = 10

        # Night-phase action queue
        self.night_action_queue: List[Dict] = []
        self.current_action_index: int = 0
        self.pending_prompt: Optional[PendingPrompt] = None

        # Round event log (public messages)
        self.round_log: List[str] = []

    # ── look-ups ──────────────────────────────────────────────────────────

    def get_player_by_sid(self, sid: str) -> Optional[Player]:
        for p in self.players:
            if p.sid == sid:
                return p
        return None

    def get_player_by_id(self, pid: str) -> Optional[Player]:
        for p in self.players:
            if p.player_id == pid:
                return p
        return None

    def get_alive_players(self) -> List[Player]:
        return [p for p in self.players if p.alive]

    def get_players_by_house(self, house: HouseType) -> List[Player]:
        return [p for p in self.players if p.house_card and p.house_card.house == house]

    # ── serialisation ─────────────────────────────────────────────────────

    def to_dict(self, for_sid: Optional[str] = None) -> Dict:
        plist = []
        for p in self.players:
            if for_sid and for_sid == p.sid:
                plist.append(p.to_dict(for_self=True))
            else:
                plist.append(p.to_dict())
        return {
            'room_code': self.room_code,
            'host_sid': self.host_sid,
            'phase': self.phase.value,
            'round_number': self.round_number,
            'current_rank': self.current_rank,
            'score_pool_count': len(self.score_pool),
            'discard_count': len(self.discard_pile),
            'players': plist,
            'player_count': len(self.players),
            'winning_threshold': self.winning_threshold,
        }


# ─── Deck & score pool factories ─────────────────────────────────────────────

def create_card_deck() -> List[Card]:
    """Create the standard 33-card ninja deck."""
    deck: List[Card] = []

    # 6× Spy  (rank 1, #1-6)
    for i in range(6):
        deck.append(Card(CardType.SPY, rank=1, number=i + 1))

    # 6× Mystic  (rank 2, #1-6)
    for i in range(6):
        deck.append(Card(CardType.MYSTIC, rank=2, number=i + 1))

    # 6× Trickster variants  (rank 3, #1-6)
    variants = [
        TricksterVariant.SHAPESHIFTER,    # #1
        TricksterVariant.GRAVEROBBER,     # #2
        TricksterVariant.TROUBLEMAKER,    # #3
        TricksterVariant.SOUL_MERCHANT,   # #4
        TricksterVariant.THIEF,           # #5
        TricksterVariant.JUDGE,           # #6
    ]
    for i, v in enumerate(variants):
        deck.append(Card(CardType.TRICKSTER, rank=3, variant=v.value, number=i + 1))

    # 6× Blind Assassin  (rank 4, #1-6)
    for i in range(6):
        deck.append(Card(CardType.ASSASSIN, rank=4, number=i + 1))

    # 6× Shinobi  (rank 5, #1-6)
    for i in range(6):
        deck.append(Card(CardType.SHINOBI, rank=5, number=i + 1))

    # 3× Special (no rank)
    deck.append(Card(CardType.MARTYR))
    deck.append(Card(CardType.MIRROR_MONK))
    deck.append(Card(CardType.MASTERMIND))

    return deck


def create_score_pool() -> List[int]:
    """35 tokens: 14×2, 14×3, 7×4  (total value = 98)."""
    pool = [2] * 14 + [3] * 14 + [4] * 7
    random.shuffle(pool)
    return pool
