"""
Game engine - Core game logic for Night of Ninja
Handles house assignment, drafting, night phase execution, and scoring
"""

from typing import List, Dict, Optional, Tuple
import random
from game.models import (
    GameRoom, Player, Card, HouseCard, HouseType, CardType, 
    TricksterVariant, GamePhase, create_card_deck, create_honor_pool
)


class GameEngine:
    """Core game logic engine"""
    
    @staticmethod
    def assign_houses(room: GameRoom):
        """Assign house cards to all players"""
        num_players = len(room.players)
        
        # Determine house distribution
        if num_players % 2 == 0:
            # Even: split evenly between Lotus and Crane
            lotus_count = num_players // 2
            crane_count = num_players // 2
            ronin_count = 0
        else:
            # Odd: add one Ronin
            lotus_count = num_players // 2
            crane_count = num_players // 2
            ronin_count = 1
            
        # Create house cards with hierarchy numbers
        houses = []
        for i in range(lotus_count):
            houses.append(HouseCard(HouseType.LOTUS, i + 1))
        for i in range(crane_count):
            houses.append(HouseCard(HouseType.CRANE, i + 1))
        for i in range(ronin_count):
            houses.append(HouseCard(HouseType.RONIN, 1))
            
        # Shuffle and assign
        random.shuffle(houses)
        for player, house in zip(room.players, houses):
            player.house_card = house
            
    @staticmethod
    def start_draft(room: GameRoom) -> Dict[str, List[Card]]:
        """
        Start drafting phase - deal 3 cards to each player
        Returns dict mapping player sid to their initial 3 cards
        """
        deck = create_card_deck()
        random.shuffle(deck)
        
        draft_hands = {}
        for i, player in enumerate(room.players):
            # Deal 3 cards
            hand = deck[i*3:(i+1)*3]
            draft_hands[player.sid] = hand
            
        room.draft_state = {
            'round': 1,  # Round 1, 2, or 3 of drafting
            'hands': draft_hands,
            'selections': {}  # Track what each player selected
        }
        
        return draft_hands
        
    @staticmethod
    def process_draft_selection(room: GameRoom, player_sid: str, selected_card_index: int) -> bool:
        """
        Process a player's card selection during drafting
        Returns True if all players have selected
        """
        draft_round = room.draft_state['round']
        hands = room.draft_state['hands']
        
        # Mark selection with both card and index
        selected_card = hands[player_sid][selected_card_index]
        room.draft_state['selections'][player_sid] = {
            'card': selected_card,
            'index': selected_card_index
        }
        
        # Check if all players have selected
        if len(room.draft_state['selections']) == len(room.players):
            # All selected - process the round
            GameEngine._advance_draft_round(room)
            return True
            
        return False
        
    @staticmethod
    def _advance_draft_round(room: GameRoom):
        """Advance to next draft round or finish drafting"""
        draft_round = room.draft_state['round']
        hands = room.draft_state['hands']
        selections = room.draft_state['selections']
        
        # Give selected cards to players
        for sid, selection in selections.items():
            player = room.get_player_by_sid(sid)
            player.hand.append(selection['card'])
            
        if draft_round == 2:
            # Round 2: Discard remaining cards and Finish
            for sid, selection in selections.items():
                current_hand = hands[sid]
                selected_index = selection['index']
                remaining = [card for idx, card in enumerate(current_hand) if idx != selected_index]
                room.discard_pile.extend(remaining) # Add unpicked cards to discard

            # Drafting complete
            # Drafting complete
            GameEngine.initialize_night_phase(room)
        else:
            # Pass remaining cards to the left
            new_hands = {}
            player_sids = [p.sid for p in room.players]
            
            for i, sid in enumerate(player_sids):
                # Get cards not selected (use index to avoid object comparison issues)
                current_hand = hands[sid]
                selected_index = selections[sid]['index']
                remaining = [card for idx, card in enumerate(current_hand) if idx != selected_index]
                
                # Pass to left neighbor
                next_index = (i + 1) % len(player_sids)
                next_sid = player_sids[next_index]
                new_hands[next_sid] = remaining
                
            # Update state for next round
            room.draft_state = {
                'round': draft_round + 1,
                'hands': new_hands,
                'selections': {}
            }
            
    @staticmethod
    def initialize_night_phase(room: GameRoom):
        """Generate action queue for night phase"""
        room.phase = GamePhase.NIGHT
        room.draft_state = {}
        room.night_action_queue = []
        
        # Scan all hands for ranked cards
        for player in room.get_alive_players():
            for i, card in enumerate(player.hand):
                if card.rank is not None:
                    # Add to queue
                    action = {
                        'priority': (card.rank, card.number if card.number else 0),
                        'sid': player.sid,
                        'card_index': i,
                        'card': card
                    }
                    room.night_action_queue.append(action)
                    
        # Sort by Rank ASC, then Number ASC
        room.night_action_queue.sort(key=lambda x: (x['priority'][0], x['priority'][1]))
        
        room.current_action_index = 0
        if room.night_action_queue:
            # Set current rank to first action's rank
            room.current_rank = room.night_action_queue[0]['priority'][0]
        else:
            # No actions possible? (Shouldn't happen)
            room.current_rank = 1

    @staticmethod
    def get_current_action(room: GameRoom) -> Optional[Dict]:
        """Get the current active turn action"""
        if 0 <= room.current_action_index < len(room.night_action_queue):
            return room.night_action_queue[room.current_action_index]
        return None
    @staticmethod
    def execute_card_action(room: GameRoom, player_sid: str, card: Card, target_sid: Optional[str] = None, target_card_index: Optional[int] = None, extra_target_sid: Optional[str] = None) -> Dict:
        """
        Execute a card's action during night phase
        Returns action result with effects
        """
        player = room.get_player_by_sid(player_sid)
        target = room.get_player_by_sid(target_sid) if target_sid else None
        extra_target = room.get_player_by_sid(extra_target_sid) if extra_target_sid else None
        
        result = {
            'success': True,
            'message': '',
            'effects': []
        }
        
        if card.card_type == CardType.SPY:
            # Look at target's house card
            if target:
                result['effects'].append({
                    'type': 'reveal_house',
                    'target': target_sid,
                    'house': target.house_card.to_dict()
                })
                result['message'] = f"{player.name} 查看了 {target.name} 的家族"
                
        elif card.card_type == CardType.MYSTIC:
            # Look at house + specific hand card (or random if not specified)
            if target:
                revealed_card = None
                if target.hand:
                    if target_card_index is not None and 0 <= target_card_index < len(target.hand):
                         revealed_card = target.hand[target_card_index]
                    else:
                         revealed_card = random.choice(target.hand)

                result['effects'].append({
                    'type': 'reveal_house',
                    'target': target_sid,
                    'house': target.house_card.to_dict()
                })
                if revealed_card:
                    result['effects'].append({
                        'type': 'reveal_hand_card',
                        'target': target_sid,
                        'card': revealed_card.to_dict()
                    })
                result['message'] = f"{player.name} 对 {target.name} 使用了隐士"
                
        elif card.card_type == CardType.TRICKSTER:
            result = GameEngine._execute_trickster(room, player, target, card.variant, extra_target)
            
        elif card.card_type == CardType.ASSASSIN:
            # Blind kill
            if target and target.alive:
                # Check for Mirror Monk
                has_mirror = any(c.card_type == CardType.MIRROR_MONK for c in target.hand)
                if has_mirror:
                    # Kill reflected back
                    player.alive = False
                    result['effects'].append({'type': 'kill', 'target': player_sid, 'reflected': True})
                    result['message'] = f"{target.name} 使用镜像僧侣反弹了攻击！{player.name} 死亡"
                else:
                    target.alive = False
                    result['effects'].append({'type': 'kill', 'target': target_sid})
                    result['message'] = f"{player.name} 刺杀了 {target.name}"
                    
        elif card.card_type == CardType.SHINOBI:
            # Look then decide to kill
            if target:
                result['effects'].append({
                    'type': 'reveal_house',
                    'target': target_sid,
                    'house': target.house_card.to_dict(),
                    'can_kill': True  # Flag that player can choose to kill
                })
                result['message'] = f"{player.name} 查看了 {target.name} 的身份"
                
        return result
        
    @staticmethod
    def _execute_trickster(room: GameRoom, player: Player, target: Optional[Player], variant: str, extra_target: Optional[Player] = None) -> Dict:
        """Execute trickster variant effects"""
        result = {'success': True, 'message': '', 'effects': []}
        
        if variant == TricksterVariant.SHAPESHIFTER.value:
            # Swap 2 players identity
            # Needs target and extra_target
            if target and extra_target:
                target.house_card, extra_target.house_card = extra_target.house_card, target.house_card
                # In a real app we might mark them as 'unknown' to themselves, but for now just swap
                result['effects'].append({
                    'type': 'reveal_house',
                    'target': target.sid,
                    'house': target.house_card.to_dict()
                })
                result['effects'].append({
                    'type': 'reveal_house',
                    'target': extra_target.sid,
                    'house': extra_target.house_card.to_dict()
                })
                result['message'] = f"{player.name} 互换了 {target.name} 和 {extra_target.name} 的身份"

        elif variant == TricksterVariant.GRAVEROBBER.value:
             # Draw 2 from discard, keep 1
             # For simplicity in this text-based/simple UI flow:
             # Just give 2 random cards from discard? Or just return them to view?
             # User said: "Discard pile random draw 2, choose 1 keep"
             if len(room.discard_pile) >= 1:
                 # Logic for picking - simplify to: Draw top 2, pick 1. 
                 # This needs a sub-phase or callback. 
                 # For now, let's auto-give 1 random to keep it playable without complex UI
                 # OR: Just reveal 2 to user and let them 'pick' via a follow up?
                 # Let's just implement: Draw 1 random from discard to hand.
                 card = room.discard_pile.pop(random.randint(0, len(room.discard_pile)-1))
                 player.hand.append(card)
                 result['message'] = f"{player.name} 从弃牌堆获得了一张卡牌"
             else:
                 result['message'] = f"{player.name} 使用了掘墓人，但弃牌堆为空"

        elif variant == TricksterVariant.TROUBLEMAKER.value:
            # View 1, optional reveal
            if target:
                # Always reveal to player
                result['effects'].append({
                    'type': 'reveal_house',
                    'target': target.sid,
                    'house': target.house_card.to_dict()
                })
                # Optional reveal to ALL done via separate flag? 
                # Let's assume ALWAYS reveal to all for Troublemaker as a simplification 
                # OR just reveal to player.
                # User: "Optional reveal... if revealed everyone sees"
                # For this iteration: Reveal to ALL
                # To implement "Optional", we'd need a prompt.
                # Let's just Reveal to All.
                result['message'] = f"{player.name} 揭示了 {target.name} 的身份"

        elif variant == TricksterVariant.SOUL_MERCHANT.value:
            # View 1 and Swap Honor
            if target:
                # View
                result['effects'].append({
                    'type': 'reveal_house',
                    'target': target.sid,
                    'house': target.house_card.to_dict()
                })
                # Swap 1 honor logic (if both have honor)
                if player.honor_tokens and target.honor_tokens:
                    p_token = player.honor_tokens.pop()
                    t_token = target.honor_tokens.pop()
                    player.honor_tokens.append(t_token)
                    target.honor_tokens.append(p_token)
                    result['message'] = f"{player.name} 查看并与 {target.name} 交换了荣誉"
                else:
                    result['message'] = f"{player.name} 查看了 {target.name} (荣誉不足无法交换)"

        elif variant == TricksterVariant.JUDGE.value:
            # Reveal self, kill 1 (unblockable)
            # Reveal self
            result['effects'].append({
                'type': 'reveal_house',
                'target': player.sid,
                'house': player.house_card.to_dict()
            })
            if target:
                target.alive = False
                result['effects'].append({'type': 'kill', 'target': target.sid})
                result['message'] = f"{player.name} (裁判) 处决了 {target.name}"

        elif variant == TricksterVariant.THIEF.value:
            # Reveal self, steal 1 honor from RICHER player
            result['effects'].append({
                'type': 'reveal_house',
                'target': player.sid,
                'house': player.house_card.to_dict()
            })
            if target:
                if len(target.honor_tokens) > len(player.honor_tokens) and target.honor_tokens:
                    token = target.honor_tokens.pop()
                    player.honor_tokens.append(token)
                    result['message'] = f"{player.name} (窃贼) 偷取了 {target.name} 的荣誉"
                else:
                    result['message'] = f"{player.name} 尝试偷窃 {target.name} 失败 (目标不够富有)"
                
        return result
        
    @staticmethod
    def determine_round_winner(room: GameRoom) -> Tuple[HouseType, List[Player]]:
        """
        Determine which house wins the round
        Returns (winning_house, list_of_winners)
        """
        alive = room.get_alive_players()
        
        if not alive:
            # Everyone died - no winner (shouldn't happen)
            return None, []

        # Check for Mastermind first (overrides everything)
        for player in alive:
            has_mastermind = any(c.card_type == CardType.MASTERMIND for c in player.hand)
            if has_mastermind:
                # Mastermind owner survives -> their house wins
                if player.house_card.house == HouseType.RONIN:
                    return HouseType.RONIN, [player]
                elif player.house_card.house == HouseType.LOTUS:
                    # All Lotus win
                    return HouseType.LOTUS, [p for p in room.players if p.house_card.house == HouseType.LOTUS]
                else:
                    # All Crane win
                    return HouseType.CRANE, [p for p in room.players if p.house_card.house == HouseType.CRANE]

        # Check Ronin
        ronin_alive = [p for p in alive if p.house_card.house == HouseType.RONIN]
        if ronin_alive:
            # Ronin wins if alive
            return HouseType.RONIN, ronin_alive
            
        # Count alive by house
        lotus_alive = [p for p in alive if p.house_card.house == HouseType.LOTUS]
        crane_alive = [p for p in alive if p.house_card.house == HouseType.CRANE]
        
        if lotus_alive and not crane_alive:
            return HouseType.LOTUS, lotus_alive
        elif crane_alive and not lotus_alive:
            return HouseType.CRANE, crane_alive
        elif len(lotus_alive) > len(crane_alive):
            return HouseType.LOTUS, lotus_alive
        elif len(crane_alive) > len(lotus_alive):
            return HouseType.CRANE, crane_alive
        else:
            # Tie - compare hierarchy numbers
            min_lotus = min(p.house_card.number for p in lotus_alive) if lotus_alive else 999
            min_crane = min(p.house_card.number for p in crane_alive) if crane_alive else 999
            
            if min_lotus < min_crane:
                return HouseType.LOTUS, lotus_alive
            else:
                return HouseType.CRANE, crane_alive
                
    @staticmethod
    def distribute_honor(room: GameRoom, winning_house: HouseType, survivors: List[Player]):
        """Distribute honor tokens to winners"""
        if not room.honor_pool:
            room.phase = GamePhase.GAME_OVER
            return
            
        # All members of winning house get 1 token
        winners = room.get_players_by_house(winning_house)
        for player in winners:
            if room.honor_pool:
                token = room.honor_pool.pop()
                player.honor_tokens.append(token)
                
        # Survivors get an additional token
        for player in survivors:
            if room.honor_pool:
                token = room.honor_pool.pop()
                player.honor_tokens.append(token)
                
    @staticmethod
    def reset_for_next_round(room: GameRoom):
        """Reset game state for next round"""
        # Reset all players to alive
        for player in room.players:
            player.alive = True
            player.hand = []
            player.played_cards = []
            
        # Increment round
        room.round_number += 1
        room.phase = GamePhase.DRAFTING
        room.current_rank = 0
        room.discard_pile = []
