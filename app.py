"""
Night of Ninja Online – Flask + SocketIO Server
"""

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import random, string

from typing import Dict, Any

from game.models import (
    GameRoom, Player, GamePhase, PromptType,
)
from game.engine import GameEngine

# ─── App setup ────────────────────────────────────────────────────────────────

app = Flask(__name__)
app.config['SECRET_KEY'] = 'night-of-ninja-secret-key-2026'
socketio = SocketIO(app, cors_allowed_origins="*", ping_interval=25, ping_timeout=60)

game_rooms: dict[str, GameRoom] = {}
player_id_map: dict[str, tuple[str, str]] = {}   # player_id → (room_code, sid)


def _code() -> str:
    while True:
        c = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        if c not in game_rooms:
            return c


# ═══════════════════════════════════════════════════════════════════════════════
#  HTTP
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')


# ═══════════════════════════════════════════════════════════════════════════════
#  CONNECTION
# ═══════════════════════════════════════════════════════════════════════════════

@socketio.on('connect')
def handle_connect():
    emit('connected', {'sid': request.sid})


@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    for code, room in list(game_rooms.items()):
        player = room.get_player_by_sid(sid)
        if not player:
            continue

        if room.phase == GamePhase.LOBBY:
            room.players.remove(player)
            if not room.players or sid == room.host_sid:
                del game_rooms[code]
                emit('room_closed', {'reason': '房主离开'}, room=code)
            else:
                emit('player_left', {'player': player.to_dict(),
                                     'room': room.to_dict()}, room=code)
        else:
            # Game in progress – mark disconnected, keep seat
            player.connected = False
            emit('player_disconnected', {
                'player_sid': sid,
                'name': player.name,
                'room': room.to_dict(),
            }, room=code)

            # Auto-resolve prompt if it was their turn
            if room.pending_prompt and room.pending_prompt.target_sid == sid:
                result = GameEngine.auto_resolve_prompt(room)
                if result:
                    _broadcast_prompt_result(code, result)
                    _process_night(code)


@socketio.on('reconnect_player')
def handle_reconnect(data):
    pid = data.get('player_id', '')
    if pid not in player_id_map:
        emit('error', {'message': '无法重连'})
        return

    code, _old_sid = player_id_map[pid]
    if code not in game_rooms:
        del player_id_map[pid]
        emit('error', {'message': '房间已关闭'})
        return

    room = game_rooms[code]
    player = room.get_player_by_id(pid)
    if not player:
        emit('error', {'message': '玩家不存在'})
        return

    old_sid = player.sid
    player.sid = request.sid
    player.connected = True
    player_id_map[pid] = (code, request.sid)
    join_room(code)

    # Update stale sids in night_action_queue
    if room.night_action_queue:
        for action in room.night_action_queue:
            if action['sid'] == old_sid:
                action['sid'] = request.sid

    # Update stale sids in draft_state
    if room.draft_state:
        for key in ('hands', 'selections'):
            d = room.draft_state.get(key, {})
            if old_sid in d:
                d[request.sid] = d.pop(old_sid)

    # Send full state
    emit('reconnected', {
        'room_code': code,
        'room': room.to_dict(for_sid=request.sid),
        'your_house': player.house_card.to_dict() if player.house_card else None,
        'your_hand': [c.to_dict() for c in player.hand],
    })

    emit('player_reconnected', {
        'player': player.to_dict(), 'room': room.to_dict()
    }, room=code)

    # If there's a pending prompt for this player, update sids and resend
    if room.pending_prompt and room.pending_prompt.target_sid == old_sid:
        room.pending_prompt.target_sid = request.sid
        # Also update any stale sids stored in prompt.data
        if room.pending_prompt.data:
            for key in ('attacker_sid', 'target_sid', 'player_sid'):
                if room.pending_prompt.data.get(key) == old_sid:
                    room.pending_prompt.data[key] = request.sid
        emit('prompt', room.pending_prompt.to_dict(), room=request.sid)

    # If it's this player's card-play turn during night, resend action_turn
    if room.phase == GamePhase.NIGHT and not room.pending_prompt:
        cur = GameEngine.get_current_action(room)
        if cur and cur['sid'] == old_sid:
            cur['sid'] = request.sid
            emit('action_turn', {
                'rank': cur['priority'][0],
                'number': cur['priority'][1],
                'card_id': cur['card'].id,
                'player_sid': request.sid,
            }, room=request.sid)


# ═══════════════════════════════════════════════════════════════════════════════
#  LOBBY
# ═══════════════════════════════════════════════════════════════════════════════

@socketio.on('create_room')
def handle_create_room(data):
    name = data.get('name', 'Player')[:12]
    avatar = data.get('avatar', 1)
    code = _code()

    room = GameRoom(code, request.sid)
    player = Player(request.sid, name, avatar)
    room.players.append(player)
    game_rooms[code] = room
    player_id_map[player.player_id] = (code, request.sid)
    join_room(code)

    emit('room_created', {
        'room_code': code,
        'player_id': player.player_id,
        'room': room.to_dict(for_sid=request.sid),
    })


@socketio.on('join_room')
def handle_join_room(data):
    code = data.get('room_code', '').upper().strip()
    name = data.get('name', 'Player')[:12]
    avatar = data.get('avatar', 1)

    if code not in game_rooms:
        emit('error', {'message': '房间不存在'})
        return
    room = game_rooms[code]
    if len(room.players) >= GameRoom.MAX_PLAYERS:
        emit('error', {'message': '房间已满（最多11人）'})
        return
    if room.phase != GamePhase.LOBBY:
        emit('error', {'message': '游戏已开始，无法加入'})
        return

    player = Player(request.sid, name, avatar)
    room.players.append(player)
    player_id_map[player.player_id] = (code, request.sid)
    join_room(code)

    emit('room_joined', {
        'room_code': code,
        'player_id': player.player_id,
        'room': room.to_dict(for_sid=request.sid),
    })
    emit('player_joined', {
        'player': player.to_dict(),
        'room': room.to_dict(),
    }, room=code)


@socketio.on('update_settings')
def handle_update_settings(data):
    code = data.get('room_code')
    settings = data.get('settings', {})
    if code not in game_rooms:
        return
    room = game_rooms[code]
    if request.sid != room.host_sid:
        return emit('error', {'message': '只有房主可以更改设置'})
    if room.phase != GamePhase.LOBBY:
        return emit('error', {'message': '游戏已开始'})

    if 'winning_threshold' in settings:
        try:
            v = int(settings['winning_threshold'])
            if 5 <= v <= 30:
                room.winning_threshold = v
        except (ValueError, TypeError):
            pass

    emit('room_updated', {'room': room.to_dict()}, room=code)


@socketio.on('leave_room')
def handle_leave_room(data):
    code = data.get('room_code')
    if code not in game_rooms:
        return
    room = game_rooms[code]
    player = room.get_player_by_sid(request.sid)
    if not player:
        return

    room.players.remove(player)
    leave_room(code)

    if not room.players or request.sid == room.host_sid:
        del game_rooms[code]
        emit('room_closed', {'reason': '房主离开'}, room=code)
    else:
        emit('player_left', {'player': player.to_dict(),
                             'room': room.to_dict()}, room=code)


# ═══════════════════════════════════════════════════════════════════════════════
#  GAME START
# ═══════════════════════════════════════════════════════════════════════════════

@socketio.on('start_game')
def handle_start_game(data):
    code = data.get('room_code')
    if code not in game_rooms:
        return emit('error', {'message': '房间不存在'})
    room = game_rooms[code]
    if request.sid != room.host_sid:
        return emit('error', {'message': '只有房主可以开始游戏'})
    if len(room.players) < GameRoom.MIN_PLAYERS:
        return emit('error', {'message': f'至少需要 {GameRoom.MIN_PLAYERS} 名玩家'})

    # Start first round
    GameEngine.start_round(room)

    # Notify each player individually (secret house)
    for p in room.players:
        emit('game_started', {
            'room': room.to_dict(for_sid=p.sid),
            'your_house': p.house_card.to_dict(),
        }, room=p.sid)

    # Begin draft
    draft_hands = GameEngine.start_draft(room)
    for p in room.players:
        emit('draft_started', {
            'round': 1,
            'cards': [c.to_dict() for c in draft_hands[p.sid]],
        }, room=p.sid)


# ═══════════════════════════════════════════════════════════════════════════════
#  DRAFTING
# ═══════════════════════════════════════════════════════════════════════════════

@socketio.on('select_draft_card')
def handle_select_draft(data):
    code = data.get('room_code')
    idx = data.get('card_index')
    if code not in game_rooms:
        return
    room = game_rooms[code]
    if room.phase != GamePhase.DRAFTING:
        return emit('error', {'message': '现在不是轮抽阶段'})
    if request.sid in room.draft_state.get('selections', {}):
        return  # already selected

    try:
        idx = int(idx)
    except (ValueError, TypeError):
        return emit('error', {'message': '无效选择'})

    all_done = GameEngine.process_draft_selection(room, request.sid, idx)
    if not all_done:
        return  # still waiting for other players

    if room.phase == GamePhase.NIGHT:
        # Draft finished → night
        _start_night_broadcast(code)
    else:
        # Next draft round
        for p in room.players:
            cards = room.draft_state['hands'].get(p.sid, [])
            emit('draft_continued', {
                'round': room.draft_state['round'],
                'cards': [c.to_dict() for c in cards],
            }, room=p.sid)


# ═══════════════════════════════════════════════════════════════════════════════
#  NIGHT PHASE
# ═══════════════════════════════════════════════════════════════════════════════

@socketio.on('play_card')
def handle_play_card(data):
    code = data.get('room_code')
    card_id = data.get('card_id')
    target_sid = data.get('target_sid')
    extra = data.get('extra_data', {})

    if code not in game_rooms:
        return
    room = game_rooms[code]
    player = room.get_player_by_sid(request.sid)
    if not player or not player.alive:
        return emit('error', {'message': '你已经死亡'})

    cur = GameEngine.get_current_action(room)
    if not cur or cur['sid'] != request.sid:
        return emit('error', {'message': '还没轮到你'})

    # Validate card
    card = player.find_card_by_id(card_id)
    if not card or card.id != cur['card'].id:
        return emit('error', {'message': '请打出正确的卡牌'})

    # Prevent self-targeting
    if target_sid and target_sid == request.sid:
        return emit('error', {'message': '不能以自己为目标'})

    # Execute
    result = GameEngine.execute_card(room, request.sid, card, target_sid, extra)

    # Send private result to acting player
    emit('action_result', result, room=request.sid)

    # Send updated hand
    emit('your_hand', {'cards': [c.to_dict() for c in player.hand]}, room=request.sid)

    # Broadcast public info
    if result.get('public_message'):
        room.round_log.append(result['public_message'])
        emit('card_played', {
            'player_name': player.name,
            'player_sid': player.sid,
            'public_message': result['public_message'],
            'effects': [e for e in result.get('effects', [])
                        if e.get('type') in ('kill', 'kill_reflected', 'martyr_death',
                                             'reveal_house_public', 'steal_score',
                                             'swap_identity', 'swap_score')],
            'room': room.to_dict(),
        }, room=code)

    # Advance
    room.current_action_index += 1
    _process_night(code)


@socketio.on('skip_turn')
def handle_skip(data):
    code = data.get('room_code')
    if code not in game_rooms:
        return
    room = game_rooms[code]
    cur = GameEngine.get_current_action(room)
    if not cur or cur['sid'] != request.sid:
        return emit('error', {'message': '还没轮到你'})

    emit('action_skipped', {
        'player_sid': request.sid,
        'message': '玩家跳过了本回合',
    }, room=code)

    room.current_action_index += 1
    _process_night(code)


# ═══════════════════════════════════════════════════════════════════════════════
#  PROMPT RESPONSES
# ═══════════════════════════════════════════════════════════════════════════════

@socketio.on('prompt_response')
def handle_prompt_response(data):
    code = data.get('room_code')
    resp = data.get('response', {})
    if code not in game_rooms:
        return
    room = game_rooms[code]
    prompt = room.pending_prompt
    if not prompt:
        return emit('error', {'message': '没有待处理的提示'})
    if prompt.target_sid != request.sid:
        return emit('error', {'message': '不是你的提示'})

    pt = prompt.prompt_type
    result = None

    if pt == PromptType.KILL_REACTION:
        result = GameEngine.resolve_kill_reaction(room, resp.get('reaction', 'none'))
    elif pt == PromptType.SHINOBI_DECISION:
        result = GameEngine.resolve_shinobi_decision(room, resp.get('kill', False))
    elif pt == PromptType.GRAVEROBBER_PICK:
        result = GameEngine.resolve_graverobber_pick(room, resp.get('card_id', ''))
    elif pt == PromptType.TROUBLEMAKER_REVEAL:
        result = GameEngine.resolve_troublemaker_reveal(room, resp.get('reveal', False))
    elif pt == PromptType.SOUL_MERCHANT_CHOICE:
        result = GameEngine.resolve_soul_merchant_choice(room, resp.get('choice', 'house'))
    elif pt == PromptType.SOUL_MERCHANT_SWAP:
        result = GameEngine.resolve_soul_merchant_swap(room, resp.get('swap', False))
    elif pt == PromptType.SHAPESHIFTER_SWAP:
        result = GameEngine.resolve_shapeshifter_swap(room, resp.get('swap', False))

    if result:
        # Private result to prompted player
        emit('action_result', result, room=request.sid)
        # Update hand if it changed (graverobber)
        player = room.get_player_by_sid(request.sid)
        if player:
            emit('your_hand', {'cards': [c.to_dict() for c in player.hand]}, room=request.sid)
        _broadcast_prompt_result(code, result)

    _process_night(code)


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _broadcast_prompt_result(code: str, result: Dict):
    """Broadcast public-facing parts of a prompt resolution."""
    room = game_rooms.get(code)
    if not room:
        return
    pub = result.get('public_message', '')
    if pub:
        room.round_log.append(pub)
    effects = [e for e in result.get('effects', [])
               if e.get('type') in ('kill', 'kill_reflected', 'martyr_death',
                                    'reveal_house_public', 'swap_identity',
                                    'steal_score', 'swap_score')]
    emit('prompt_resolved', {
        'public_message': pub,
        'effects': effects,
        'room': room.to_dict(),
    }, room=code)


def _start_night_broadcast(code: str):
    """Send night-phase start events to all players."""
    room = game_rooms[code]
    emit('night_started', {
        'round': room.round_number,
        'current_rank': room.current_rank,
        'room': room.to_dict(),
    }, room=code)

    for p in room.players:
        emit('your_hand', {'cards': [c.to_dict() for c in p.hand]}, room=p.sid)

    _send_action_turn(code)


def _process_night(code: str):
    """Advance night phase: check prompts, send turns, or end round."""
    if code not in game_rooms:
        return
    room = game_rooms[code]

    # If there's a pending prompt, send it and wait
    if room.pending_prompt:
        target_sid = room.pending_prompt.target_sid
        target = room.get_player_by_sid(target_sid)
        if target and target.connected:
            emit('prompt', room.pending_prompt.to_dict(), room=target_sid)
        else:
            # Target disconnected – auto-resolve
            result = GameEngine.auto_resolve_prompt(room)
            if result:
                _broadcast_prompt_result(code, result)
                _process_night(code)  # recurse
        return

    # No prompt – try next action
    nxt = GameEngine.get_current_action(room)
    if nxt:
        _send_action_turn(code)
    else:
        _end_night(code)


def _send_action_turn(code: str):
    """Notify about the current action turn."""
    room = game_rooms[code]
    cur = GameEngine.get_current_action(room)
    if not cur:
        _end_night(code)
        return

    rank = cur['priority'][0]
    number = cur['priority'][1]
    active_sid = cur['sid']

    # Rank change notification
    if room.current_rank != rank:
        room.current_rank = rank
        emit('rank_changed', {'current_rank': rank}, room=code)

    # Generic waiting message to everyone
    emit('turn_notification', {
        'rank': rank,
        'message': '等待行动中…',
    }, room=code)

    # Private notification to active player
    emit('action_turn', {
        'rank': rank,
        'number': number,
        'card_id': cur['card'].id,
        'player_sid': active_sid,
    }, room=active_sid)


def _end_night(code: str):
    """Night phase is over → reveal → score → next round or game over."""
    room = game_rooms[code]
    room.phase = GamePhase.REVEAL

    # Reveal all surviving players' houses
    for p in room.get_alive_players():
        p.house_revealed = True

    # Determine winner
    winning_house, winners, ronin_winners = GameEngine.determine_winner(room)
    GameEngine.distribute_scores(room, winners, ronin_winners)

    room.phase = GamePhase.SCORING

    # Build score board
    scores = []
    for p in room.players:
        scores.append({
            'sid': p.sid,
            'name': p.name,
            'avatar': p.avatar,
            'alive': p.alive,
            'house': p.house_card.to_dict() if p.house_card else None,
            'total_score': p.total_score(),
            'score_count': len(p.score_tokens),
        })
    scores.sort(key=lambda x: x['total_score'], reverse=True)

    # Send each player their own token details
    for p in room.players:
        emit('round_complete', {
            'winning_house': winning_house.value if winning_house else None,
            'winners': [w.name for w in winners],
            'ronin_winners': [r.name for r in ronin_winners],
            'scores': scores,
            'your_score_tokens': list(p.score_tokens),
            'your_total': p.total_score(),
            'round_log': room.round_log,
        }, room=p.sid)

    # Check game over
    game_winner = GameEngine.check_game_over(room)
    if game_winner:
        room.phase = GamePhase.GAME_OVER
        emit('game_over', {
            'winner_name': game_winner.name,
            'winner_sid': game_winner.sid,
            'winner_score': game_winner.total_score(),
            'scores': scores,
        }, room=code)
    else:
        # Schedule next round (after client shows results)
        room.phase = GamePhase.SCORING  # client will trigger next_round


@socketio.on('next_round')
def handle_next_round(data):
    """Host triggers next round after viewing results."""
    code = data.get('room_code')
    if code not in game_rooms:
        return
    room = game_rooms[code]
    if request.sid != room.host_sid:
        return
    if room.phase not in (GamePhase.SCORING, GamePhase.REVEAL):
        return

    GameEngine.start_round(room)

    for p in room.players:
        emit('new_round', {
            'round': room.round_number,
            'your_house': p.house_card.to_dict(),
            'room': room.to_dict(for_sid=p.sid),
        }, room=p.sid)

    draft_hands = GameEngine.start_draft(room)
    for p in room.players:
        emit('draft_started', {
            'round': 1,
            'cards': [c.to_dict() for c in draft_hands[p.sid]],
        }, room=p.sid)


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print("🎴 忍者之夜 Online 服务器启动中…")
    print("🌐 http://localhost:5001")
    socketio.run(app, host='0.0.0.0', port=5001, debug=True, allow_unsafe_werkzeug=True)
