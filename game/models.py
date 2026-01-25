"""
Game data models for Night of Ninja Online
Defines cards, players, and game room state
"""

from enum import Enum
from typing import List, Optional, Dict
import random


class HouseType(Enum):
    """Player factions"""
    LOTUS = "lotus"
    CRANE = "crane"
    RONIN = "ronin"


class CardType(Enum):
    """Card categories"""
    SPY = "spy"  # Rank 1
    MYSTIC = "mystic"  # Rank 2
    TRICKSTER = "trickster"  # Rank 3
    ASSASSIN = "assassin"  # Rank 4
    SHINOBI = "shinobi"  # Rank 5
    MIRROR_MONK = "mirror_monk"  # Response
    MARTYR = "martyr"  # Response
    MASTERMIND = "mastermind"  # Special Passive


class TricksterVariant(Enum):
    """Different Trickster card effects"""
    SHAPESHIFTER = "shapeshifter"   # #1: Swap 2 houses
    GRAVEROBBER = "graverobber"     # #2: Draw 2 keep 1 from discard
    TROUBLEMAKER = "troublemaker"   # #3: View 1, optional reveal
    SOUL_MERCHANT = "soul_merchant" # #4: View 1 honor/house, swap 1 honor
    JUDGE = "judge"                 # #5: Reveal self, kill 1 (unblockable)
    THIEF = "thief"                 # #6: Reveal self, steal 1 honor


class Card:
    """Base ninja card"""
    def __init__(self, card_type: CardType, rank: Optional[int] = None, variant: Optional[str] = None, number: Optional[int] = None):
        self.card_type = card_type
        self.rank = rank
        self.variant = variant
        self.number = number  # 1-6, determines turn order within rank
        
    def to_dict(self):
        return {
            'type': self.card_type.value,
            'rank': self.rank,
            'variant': self.variant,
            'number': self.number
        }

    def __eq__(self, other):
        if not isinstance(other, Card):
            return False
        return (self.card_type == other.card_type and 
                self.rank == other.rank and 
                self.variant == other.variant and
                self.number == other.number)

    def __repr__(self):
        return f"Card(type={self.card_type.value}, rank={self.rank}, variant={self.variant}, number={self.number})"


class HouseCard:
    """Faction card with hierarchy"""
    def __init__(self, house: HouseType, number: int):
        self.house = house
        self.number = number  # 1-5, lower is higher rank for tiebreaking
        
    def to_dict(self):
        return {
            'house': self.house.value,
            'number': self.number
        }


class Player:
    """Player state"""
    def __init__(self, sid: str, name: str, avatar: int):
        self.sid = sid  # Socket ID
        self.name = name
        self.avatar = avatar  # 1-12
        self.house_card: Optional[HouseCard] = None
        self.hand: List[Card] = []
        self.played_cards: List[Card] = []
        self.alive = True
        self.honor_tokens: List[int] = []  # Honor point values
        self.revealed_info: Dict = {}  # Information this player has learned
        
    def total_honor(self) -> int:
        """Calculate total honor points"""
        return sum(self.honor_tokens)
        
    def to_dict(self, reveal_secrets=False):
        """Convert to dictionary, optionally revealing secret info"""
        data = {
            'sid': self.sid,
            'name': self.name,
            'avatar': self.avatar,
            'alive': self.alive,
            'honor_count': len(self.honor_tokens),
            'total_honor': self.total_honor(),
            'hand_count': len(self.hand)
        }
        if reveal_secrets:
            data['house'] = self.house_card.to_dict() if self.house_card else None
            data['hand'] = [c.to_dict() for c in self.hand]
            data['honor_tokens'] = self.honor_tokens
        return data


class GamePhase(Enum):
    """Game phases"""
    LOBBY = "lobby"
    ASSIGNMENT = "assignment"
    DRAFTING = "drafting"
    NIGHT = "night"
    SCORING = "scoring"
    GAME_OVER = "game_over"


class GameRoom:
    """Complete game state for a room"""
    def __init__(self, room_code: str, host_sid: str):
        self.room_code = room_code
        self.host_sid = host_sid
        self.players: List[Player] = []
        self.phase = GamePhase.LOBBY
        self.round_number = 0
        self.current_rank = 0  # Current rank being called (1-5)
        self.honor_pool: List[int] = []  # Remaining honor tokens
        self.discard_pile: List[Card] = []
        self.draft_state: Dict = {}  # Tracks drafting progress
        self.pending_actions: List[Dict] = []  # Actions waiting to resolve
        
        # Night phase action queue
        # List of dicts: {'priority': (rank, number), 'sid': str, 'card_index': int, 'card': Card}
        self.night_action_queue: List[Dict] = []
        self.current_action_index: int = 0
        
    def get_player_by_sid(self, sid: str) -> Optional[Player]:
        """Find player by socket ID"""
        for player in self.players:
            if player.sid == sid:
                return player
        return None
        
    def get_alive_players(self) -> List[Player]:
        """Get all living players"""
        return [p for p in self.players if p.alive]
        
    def get_players_by_house(self, house: HouseType) -> List[Player]:
        """Get all players of a specific house"""
        return [p for p in self.players if p.house_card and p.house_card.house == house]
        
    def to_dict(self, for_sid: Optional[str] = None):
        """Convert room to dictionary, optionally revealing info for specific player"""
        player_list = []
        for p in self.players:
            # Only reveal secrets to the player themselves
            reveal = (for_sid == p.sid)
            player_list.append(p.to_dict(reveal_secrets=reveal))
            
        return {
            'room_code': self.room_code,
            'host_sid': self.host_sid,
            'phase': self.phase.value,
            'round_number': self.round_number,
            'current_rank': self.current_rank,
            'honor_pool_count': len(self.honor_pool),
            'players': player_list,
            'player_count': len(self.players)
        }


def create_card_deck() -> List[Card]:
    """Create a standard deck of ninja cards (33 cards total)"""
    deck = []
    
    # Rank 1: Spy (6 copies, numbers 1-6)
    for i in range(6):
        deck.append(Card(CardType.SPY, rank=1, number=i+1))
        
    # Rank 2: Mystic (6 copies, numbers 1-6)
    for i in range(6):
        deck.append(Card(CardType.MYSTIC, rank=2, number=i+1))
        
    # Rank 3: Trickster variants (6 copies, 1 of each type 1-6)
    variants = [
        TricksterVariant.SHAPESHIFTER,  # 1
        TricksterVariant.GRAVEROBBER,   # 2
        TricksterVariant.TROUBLEMAKER,  # 3
        TricksterVariant.SOUL_MERCHANT, # 4
        TricksterVariant.JUDGE,         # 5
        TricksterVariant.THIEF          # 6
    ]
    # Assign numbers 1-6 sequentially to tricksters
    for i, variant in enumerate(variants):
        deck.append(Card(CardType.TRICKSTER, rank=3, variant=variant.value, number=i+1))
    
    # Rank 4: Blind Assassin (6 copies, numbers 1-6)
    for i in range(6):
        deck.append(Card(CardType.ASSASSIN, rank=4, number=i+1))
        
    # Rank 5: Shinobi (6 copies, numbers 1-6)
    for i in range(6):
        deck.append(Card(CardType.SHINOBI, rank=5, number=i+1))
        
    # Special cards (1 of each)
    deck.append(Card(CardType.MIRROR_MONK, rank=None))
    deck.append(Card(CardType.MARTYR, rank=None))
    deck.append(Card(CardType.MASTERMIND, rank=None))
        
    return deck


def create_honor_pool(num_players: int) -> List[int]:
    """Create pool of honor tokens (random values 1-5)"""
    # Create enough tokens for ~5 rounds of play
    num_tokens = num_players * 10
    return [random.randint(1, 5) for _ in range(num_tokens)]
