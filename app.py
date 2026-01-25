"""
Night of Ninja Online - Flask Server
Multiplayer board game with WebSocket support
"""

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import random
import string

from game.models import GameRoom, Player, GamePhase, create_honor_pool
from game.engine import GameEngine

app = Flask(__name__)
app.config['SECRET_KEY'] = 'night-of-ninja-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global state
game_rooms: dict[str, GameRoom] = {}


def generate_room_code() -> str:
    """Generate unique 4-character room code"""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        if code not in game_rooms:
            return code


@app.route('/')
def index():
    """Serve main game page"""
    return render_template('index.html')


@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print(f"Client connected: {request.sid}")
    emit('connected', {'sid': request.sid})


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print(f"Client disconnected: {request.sid}")
    
    # Remove player from any room they're in
    for room_code, room in list(game_rooms.items()):
        player = room.get_player_by_sid(request.sid)
        if player:
            room.players.remove(player)
            
            # If room is empty or host left, delete room
            if not room.players or request.sid == room.host_sid:
                del game_rooms[room_code]
                emit('room_closed', {'reason': 'Host left'}, room=room_code)
            else:
                # Notify others
                emit('player_left', {
                    'player': player.to_dict(),
                    'room': room.to_dict()
                }, room=room_code)


@socketio.on('create_room')
def handle_create_room(data):
    """Create a new game room"""
    name = data.get('name', 'Player')
    avatar = data.get('avatar', 1)
    
    room_code = generate_room_code()
    room = GameRoom(room_code, request.sid)
    
    # Add host as first player
    player = Player(request.sid, name, avatar)
    room.players.append(player)
    
    game_rooms[room_code] = room
    join_room(room_code)
    
    emit('room_created', {
        'room_code': room_code,
        'room': room.to_dict(for_sid=request.sid)
    })
    
    print(f"Room {room_code} created by {name}")


@socketio.on('join_room')
def handle_join_room(data):
    """Join an existing room"""
    room_code = data.get('room_code', '').upper()
    name = data.get('name', 'Player')
    avatar = data.get('avatar', 1)
    
    if room_code not in game_rooms:
        emit('error', {'message': '房间不存在'})
        return
        
    room = game_rooms[room_code]
    
    # Check if room is full or game started
    if len(room.players) >= 8:
        emit('error', {'message': '房间已满'})
        return
        
    if room.phase != GamePhase.LOBBY:
        emit('error', {'message': '游戏已开始'})
        return
        
    # Add player
    player = Player(request.sid, name, avatar)
    room.players.append(player)
    join_room(room_code)
    
    # Notify player
    emit('room_joined', {
        'room_code': room_code,
        'room': room.to_dict(for_sid=request.sid)
    })
    
    # Notify all players in room
    emit('player_joined', {
        'player': player.to_dict(),
        'room': room.to_dict()
    }, room=room_code)
    
    print(f"{name} joined room {room_code}")


@socketio.on('start_game')
def handle_start_game(data):
    """Start the game (host only)"""
    room_code = data.get('room_code')
    
    if room_code not in game_rooms:
        emit('error', {'message': '房间不存在'})
        return
        
    room = game_rooms[room_code]
    
    # Verify host
    if request.sid != room.host_sid:
        emit('error', {'message': '只有房主可以开始游戏'})
        return
        
    # Check player count
    if len(room.players) < 4:
        emit('error', {'message': '至少需要4名玩家'})
        return
        
    # Initialize game
    room.phase = GamePhase.ASSIGNMENT
    room.round_number = 1
    room.honor_pool = create_honor_pool(len(room.players))
    
    # Assign houses
    GameEngine.assign_houses(room)
    
    # Notify all players - each gets their own secret house
    for player in room.players:
        emit('game_started', {
            'room': room.to_dict(for_sid=player.sid),
            'your_house': player.house_card.to_dict()
        }, room=player.sid)
        
    # Start drafting after brief delay
    room.phase = GamePhase.DRAFTING
    draft_hands = GameEngine.start_draft(room)
    
    # Send each player their draft hand
    for player in room.players:
        emit('draft_started', {
            'round': room.draft_state['round'],
            'cards': [c.to_dict() for c in draft_hands[player.sid]]
        }, room=player.sid)
        
    print(f"Game started in room {room_code}")


@socketio.on('select_draft_card')
def handle_select_draft_card(data):
    """Handle card selection during drafting"""
    room_code = data.get('room_code')
    card_index = data.get('card_index')
    
    if room_code not in game_rooms:
        return
        
    room = game_rooms[room_code]
    
    if room.phase != GamePhase.DRAFTING:
        emit('error', {'message': '现在不是选牌阶段'})
        return
        
    # Process selection
    all_selected = GameEngine.process_draft_selection(room, request.sid, card_index)
    
    if all_selected:
        if room.phase == GamePhase.NIGHT:
            # Drafting complete - start night phase
            emit('night_phase_started', {
                'round': room.round_number,
                'current_rank': room.current_rank,
                'room': room.to_dict()
            }, room=room_code)
            
            # Send each player their final hand
            for player in room.players:
                emit('your_hand', {
                    'cards': [c.to_dict() for c in player.hand]
                }, room=player.sid)
            
            # Broadcast first action turn
            current_action = GameEngine.get_current_action(room)
            if current_action:
                # Calculate real index (in case it shifted or for safety)
                real_index = -1
                action_player = room.get_player_by_sid(current_action['sid'])
                if action_player:
                    try:
                        real_index = action_player.hand.index(current_action['card'])
                    except ValueError:
                        pass # Should not happen at start
                
                emit('action_turn', {
                    'rank': current_action['priority'][0],
                    'number': current_action['priority'][1],
                    'player_sid': current_action['sid'],
                    'card_index': real_index
                }, room=room_code)
        else:
            # Continue drafting - send new hands
            for player in room.players:
                new_hand = room.draft_state['hands'][player.sid]
                emit('draft_continued', {
                    'round': room.draft_state['round'],
                    'cards': [c.to_dict() for c in new_hand]
                }, room=player.sid)


@socketio.on('play_card')
def handle_play_card(data):
    """Handle playing a card during night phase"""
    room_code = data.get('room_code')
    card_index = data.get('card_index')
    target_sid = data.get('target_sid')
    target_card_index = data.get('target_card_index')
    extra_target_sid = data.get('extra_target_sid')
    
    if room_code not in game_rooms:
        return
        
    room = game_rooms[room_code]
    player = room.get_player_by_sid(request.sid)
    
    if not player or not player.alive:
        emit('error', {'message': '你已经死亡'})
        return
        
    try:
        card_index = int(card_index)
    except (ValueError, TypeError):
        emit('error', {'message': '无效的卡牌索引'})
        return

    if card_index >= len(player.hand):
        emit('error', {'message': '无效的卡牌'})
        return
        
    card = player.hand[card_index]
    
    # Verify against action queue
    current_action = GameEngine.get_current_action(room)
    
    print(f"DEBUG: play_card request from {request.sid}")
    print(f"DEBUG: card_index={card_index}, target_sid={target_sid}")
    print(f"DEBUG: current_action={current_action}")

    if not current_action:
        print("DEBUG: No current action")
        emit('error', {'message': '没有活动的行动'})
        return
        
    if current_action['sid'] != request.sid:
        print(f"DEBUG: Wrong player. Current action sid: {current_action['sid']}")
        emit('error', {'message': '还没轮到你'})
        return
        
    # Check if this is the correct card
    target_card_obj = current_action['card']
    print(f"DEBUG: target_card_obj={target_card_obj}, player_card={card}")
    
    if card != target_card_obj:
        print("DEBUG: Card mismatch")
        emit('error', {'message': f'请按顺序打出: Rank {current_action["priority"][0]} #{current_action["priority"][1]}'})
        return
        
    # Execute card action
    print("DEBUG: Executing action...")
    result = GameEngine.execute_card_action(room, request.sid, card, target_sid, target_card_index, extra_target_sid)
    print(f"DEBUG: Result={result}")
    
    # Remove card from hand
    player.hand.pop(card_index)
    player.played_cards.append(card)
    room.discard_pile.append(card)
    
    # Send updated hand to player immediately so UI refreshes
    emit('your_hand', {
        'cards': [c.to_dict() for c in player.hand]
    }, room=request.sid)

    # Send private info to acting player FIRST (before board update)
    emit('action_result', result, room=request.sid)
    
    # Broadcast action to all players
    emit('card_played', {
        'player': player.to_dict(),
        'card': card.to_dict(),
        'result': result,
        'room': room.to_dict()
    }, room=room_code)

    # Advance to next action
    room.current_action_index += 1
    process_night_turn(room_code)


@socketio.on('skip_turn')
def handle_skip_turn(data):
    """Handle skipping a turn"""
    room_code = data.get('room_code')
    
    if room_code not in game_rooms:
        return
        
    room = game_rooms[room_code]
    
    # Verify turn
    current_action = GameEngine.get_current_action(room)
    if not current_action or current_action['sid'] != request.sid:
        emit('error', {'message': 'Not your turn'}, room=request.sid)
        return
        
    print(f"DEBUG: Player {request.sid} skipped turn")
    
    # Notify room
    emit('action_skipped', {
        'player_sid': request.sid,
        'message': '玩家跳过了回合'
    }, room=room_code)
    
    # Do NOT execute action. Card remains in hand.
    # Just advance index.
    room.current_action_index += 1
    process_night_turn(room_code)


def process_night_turn(room_code):
    """Process the next turn in night phase"""
    room = game_rooms[room_code]
    
    next_action = GameEngine.get_current_action(room)
    
    if next_action:
        # Update current rank
        rank = next_action['priority'][0]
        number = next_action['priority'][1]
        player_sid = next_action['sid']
        
        # 1. Notify everyone about RANK change (generic)
        if room.current_rank != rank:
            room.current_rank = rank
            emit('rank_changed', {
                'current_rank': rank
            }, room=room_code)
            
        # 2. Notify ALL players that a turn is pending (generic)
        # This resets everyone's UI to "Waiting..." so they don't see old states
        emit('turn_notification', {
            'rank': rank,
            'message': '等待其他玩家行动...'
        }, room=room_code)
            
        # 3. Notify ACTIVE player privately
        # We need the real card index for the client to highlight
        real_index = -1
        action_player = room.get_player_by_sid(player_sid)
        if action_player:
            try:
                # Assuming Card object identity is preserved or equality works
                real_index = action_player.hand.index(next_action['card'])
            except ValueError:
                pass 
        
        emit('action_turn', {
            'rank': rank,
            'number': number,
            'player_sid': player_sid,
            'card_index': real_index
        }, room=player_sid)
        
        print(f"DEBUG: Next turn: Rank {rank} #{number} - Player {player_sid}")

    else:
        # End of night -> Scoring
        room.phase = GamePhase.SCORING
        
        winning_house, survivors = GameEngine.determine_round_winner(room)
        GameEngine.distribute_honor(room, winning_house, survivors)
        
        # Build scores
        scores = []
        for p in room.players:
            scores.append({
                'player': p.to_dict(),
                'score': len(p.honor_tokens)
            })
        scores.sort(key=lambda x: x['score'], reverse=True)
            
        emit('round_complete', {
            'winning_house': winning_house.value if winning_house else None,
            'survivors': [p.to_dict(reveal_secrets=True) for p in survivors],
            'scores': scores,
            'room': room.to_dict()
        }, room=room_code)
        
        if room.phase == GamePhase.GAME_OVER:
            emit('game_over', {'scores': scores}, room=room_code)
        else:
            # Start next round
            GameEngine.reset_for_next_round(room)
            draft_hands = GameEngine.start_draft(room)
            
            for player in room.players:
                emit('draft_started', {
                    'round': room.draft_state['round'],
                    'cards': [c.to_dict() for c in draft_hands[player.sid]]
                }, room=player.sid)


if __name__ == '__main__':
    print("🎴 Night of Ninja Online Server Starting...")
    print("🌐 Server running on http://localhost:5001")
    socketio.run(app, host='0.0.0.0', port=5001, debug=True, allow_unsafe_werkzeug=True)
