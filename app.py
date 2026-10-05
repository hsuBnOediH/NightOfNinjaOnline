"""
Night of Ninja Online – Flask + SocketIO Server
"""

from flask import Flask, render_template, request
from flask_socketio import SocketIO, disconnect, emit, join_room, leave_room
import os
import random
import re
import secrets
import string

from typing import Dict, Any

from game.models import (
    GameRoom, Player, GamePhase, PromptType,
)
from game.engine import GameEngine

# ─── App setup ────────────────────────────────────────────────────────────────

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
allowed_origins = os.environ.get('ALLOWED_ORIGINS')
socketio = SocketIO(
    app,
    cors_allowed_origins=(allowed_origins.split(',') if allowed_origins else None),
    ping_interval=25,
    ping_timeout=60,
)

game_rooms: dict[str, GameRoom] = {}
player_id_map: dict[str, tuple[str, str]] = {}   # player_id → (room_code, sid)

# A refresh or brief network drop must not cost a player their draft pick,
# night decision or kill reaction.  The server acts for a disconnected player
# only after this many seconds.
RECONNECT_GRACE_SECONDS = 20


def _code() -> str:
    while True:
        c = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        if c not in game_rooms:
            return c


def _clean_name(value: Any) -> str:
    """Normalize a display name before it is ever broadcast to browsers."""
    name = re.sub(r'[\x00-\x1f\x7f]', '', str(value or '')).strip()
    return name[:12] or 'Player'


def _clean_avatar(value: Any) -> int:
    try:
        avatar = int(value)
    except (TypeError, ValueError):
        return 1
    return avatar if 1 <= avatar <= 12 else 1


def _forget_room_players(room: GameRoom):
    for player in room.players:
        player_id_map.pop(player.player_id, None)


def _cleanup_lobby_disconnect(code: str, player_id: str, version: int):
    """Release an abandoned lobby seat after a short reconnect grace period."""
    socketio.sleep(90)
    room = game_rooms.get(code)
    if not room or room.phase != GamePhase.LOBBY:
        return
    player = room.get_player_by_id(player_id)
    if not player or player.connected or player.disconnect_version != version:
        return

    room.players.remove(player)
    player_id_map.pop(player.player_id, None)
    if not room.players or player.sid == room.host_sid:
        _forget_room_players(room)
        game_rooms.pop(code, None)
        socketio.emit('room_closed', {'reason': '房主离线超时'}, room=code)
    else:
        socketio.emit('player_left', {
            'player': player.to_dict(),
            'room': room.to_dict(),
        }, room=code)


def _await_reconnect_grace(code: str, player_id: str, version: int):
    socketio.sleep(RECONNECT_GRACE_SECONDS)
    _expire_reconnect_grace(code, player_id, version)


def _expire_reconnect_grace(code: str, player_id: str, version: int):
    """Mark a still-missing player away and act for them where play waits."""
    # Runs from a background task.  The game helpers use flask_socketio.emit,
    # which reads the namespace from the request as in a socket event handler.
    with app.test_request_context('/'):
        request.namespace = '/'
        request.sid = None
        _act_for_away_player(code, player_id, version)


def _act_for_away_player(code: str, player_id: str, version: int):
    room = game_rooms.get(code)
    if not room:
        return
    player = room.get_player_by_id(player_id)
    if not player or player.connected or player.disconnect_version != version:
        return
    player.away = True

    if room.phase == GamePhase.DRAFTING:
        hands = room.draft_state.get('hands', {})
        selections = room.draft_state.get('selections', {})
        if player.sid in hands and player.sid not in selections:
            if GameEngine.process_draft_selection(room, player.sid, 0):
                _broadcast_draft_advance(code)
    elif room.phase == GamePhase.NIGHT:
        if room.pending_prompt and room.pending_prompt.target_sid == player.sid:
            result = GameEngine.auto_resolve_prompt(room)
            if result:
                _broadcast_prompt_result(code, result)
                _process_night(code)
        elif room.night_stage == 'committing':
            _finalize_phase_if_ready(code)
        elif room.night_stage == 'resolving':
            _process_night(code)


def _cleanup_abandoned_game(code: str):
    """Avoid retaining an abandoned in-memory game forever."""
    socketio.sleep(15 * 60)
    room = game_rooms.get(code)
    if not room or any(player.connected for player in room.players):
        return
    _forget_room_players(room)
    game_rooms.pop(code, None)


# ═══════════════════════════════════════════════════════════════════════════════
#  HTTP
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')


@app.get('/healthz')
def healthz():
    return {'status': 'ok', 'rooms': len(game_rooms)}


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

        # Keep the seat.  Lobby seats are released after 90 seconds; in a game
        # the server acts for the player only after RECONNECT_GRACE_SECONDS.
        player.connected = False
        player.disconnect_version += 1
        emit('player_disconnected', {
            'player_sid': sid,
            'name': player.name,
            'room': room.to_dict(),
        }, room=code)

        if room.phase == GamePhase.LOBBY:
            socketio.start_background_task(
                _cleanup_lobby_disconnect,
                code,
                player.player_id,
                player.disconnect_version,
            )
        else:
            socketio.start_background_task(
                _await_reconnect_grace,
                code,
                player.player_id,
                player.disconnect_version,
            )
            if room.players and not any(p.connected for p in room.players):
                socketio.start_background_task(_cleanup_abandoned_game, code)


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

    # The player id is a bearer credential, so its holder owns the seat.  A
    # refreshed tab can reconnect before the server has noticed the old socket
    # close (behind a proxy that takes up to the ping timeout); take the seat
    # over and close the superseded socket instead of rejecting the refresh.
    old_sid = player.sid
    superseded_sid = (old_sid if player.connected and old_sid != request.sid
                      else None)
    player.sid = request.sid
    player.connected = True
    player.away = False
    player.disconnect_version += 1
    if room.host_sid == old_sid:
        room.host_sid = request.sid
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

    if old_sid in room.phase_commitments:
        room.phase_commitments[request.sid] = room.phase_commitments.pop(old_sid)

    # Send full state
    emit('reconnected', {
        'room_code': code,
        'room': room.to_dict(for_sid=request.sid),
        'your_house': (player.known_house_card.to_dict()
                       if player.known_house_card else None),
        'your_hand': [c.to_dict() for c in player.hand],
        'known_houses': {
            target.sid: house.to_dict()
            for target_id, house in player.known_houses.items()
            for target in [room.get_player_by_id(target_id)]
            if target
        },
        'known_scores': {
            target.sid: list(scores)
            for target_id, scores in player.known_scores.items()
            for target in [room.get_player_by_id(target_id)]
            if target
        },
    })

    emit('player_reconnected', {
        'player': player.to_dict(), 'old_sid': old_sid, 'room': room.to_dict()
    }, room=code)

    if room.phase == GamePhase.DRAFTING:
        draft_round = room.draft_state.get('round', 1)
        already_selected = request.sid in room.draft_state.get('selections', {})
        cards = ([] if already_selected else
                 room.draft_state.get('hands', {}).get(request.sid, []))
        emit('draft_started' if draft_round == 1 else 'draft_continued', {
            'round': draft_round,
            'cards': [card.to_dict() for card in cards],
        }, room=request.sid)

    if room.phase in (GamePhase.SCORING, GamePhase.GAME_OVER):
        saved = room.last_round_results.get(player.player_id)
        if saved:
            payload = dict(saved)
            host = room.get_player_by_sid(room.host_sid)
            payload['can_start_next_round'] = (
                player.sid == room.host_sid or not host or not host.connected
            )
            emit('round_complete', payload, room=request.sid)
        if room.phase == GamePhase.GAME_OVER and room.last_game_over:
            emit('game_over', room.last_game_over, room=request.sid)

    # Update every prompt reference, even when the reconnecting player is the
    # attacker/selected target rather than the person answering the prompt.
    if room.pending_prompt:
        prompt_belongs_to_player = room.pending_prompt.target_sid == old_sid
        if prompt_belongs_to_player:
            room.pending_prompt.target_sid = request.sid
        for key in (
            'attacker_sid', 'target_sid', 'player_sid',
            'target1_sid', 'target2_sid',
        ):
            if room.pending_prompt.data.get(key) == old_sid:
                room.pending_prompt.data[key] = request.sid
        if prompt_belongs_to_player:
            emit('prompt', room.pending_prompt.to_dict(), room=request.sid)

    # If it's this player's card-play turn during night, resend action_turn
    if room.phase == GamePhase.NIGHT and not room.pending_prompt:
        if room.night_stage == 'committing' and request.sid not in room.phase_commitments:
            emit('phase_selection', {
                'rank': room.current_rank,
                'eligible_cards': [c.to_dict() for c in
                                   GameEngine.eligible_phase_cards(room, player)],
            }, room=request.sid)
        elif room.night_stage == 'committing':
            emit('phase_committed', {'rank': room.current_rank}, room=request.sid)
            committed, required = GameEngine.phase_commit_progress(room)
            emit('phase_progress', {
                'rank': room.current_rank,
                'committed': committed,
                'required': required,
            }, room=request.sid)
        cur = GameEngine.get_current_action(room)
        if cur and cur['sid'] == request.sid:
            emit('action_turn', {
                'rank': room.current_rank,
                'number': cur['card'].number,
                'card_id': cur['card'].id,
                'player_sid': request.sid,
            }, room=request.sid)

    # The seat already points at the new sid, so the superseded socket's
    # disconnect handler finds no player and changes no game state.
    if superseded_sid:
        disconnect(sid=superseded_sid)


# ═══════════════════════════════════════════════════════════════════════════════
#  LOBBY
# ═══════════════════════════════════════════════════════════════════════════════

@socketio.on('create_room')
def handle_create_room(data):
    name = _clean_name(data.get('name'))
    avatar = _clean_avatar(data.get('avatar'))
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
    name = _clean_name(data.get('name'))
    avatar = _clean_avatar(data.get('avatar'))

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
    player_id_map.pop(player.player_id, None)
    leave_room(code)

    if not room.players or request.sid == room.host_sid:
        _forget_room_players(room)
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
    if room.phase != GamePhase.LOBBY:
        return emit('error', {'message': '游戏已经开始'})
    if len(room.players) < GameRoom.MIN_PLAYERS:
        return emit('error', {'message': f'至少需要 {GameRoom.MIN_PLAYERS} 名玩家'})
    if any(not player.connected for player in room.players):
        return emit('error', {'message': '请等待掉线玩家重连后再开始'})

    # Start first round
    GameEngine.start_round(room)

    # Notify each player individually (secret house)
    for p in room.players:
        emit('game_started', {
            'room': room.to_dict(for_sid=p.sid),
            'your_house': p.known_house_card.to_dict(),
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

    hand = room.draft_state.get('hands', {}).get(request.sid)
    if hand is None or idx < 0 or idx >= len(hand):
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

@socketio.on('commit_phase')
def handle_commit_phase(data):
    """Secretly lock this rank's cards (or an empty list to pass)."""
    code = data.get('room_code')
    card_ids = data.get('card_ids', [])
    if code not in game_rooms:
        return emit('error', {'message': '房间不存在'})
    room = game_rooms[code]

    ok, message = GameEngine.commit_phase_cards(room, request.sid, card_ids)
    if not ok:
        return emit('error', {'message': message})

    emit('phase_committed', {'rank': room.current_rank}, room=request.sid)
    committed, required = GameEngine.phase_commit_progress(room)
    emit('phase_progress', {
        'rank': room.current_rank,
        'committed': committed,
        'required': required,
    }, room=code)

    _finalize_phase_if_ready(code)

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

    # Execute
    result = GameEngine.execute_card(room, request.sid, card, target_sid, extra)

    # Send private result to acting player
    emit('action_result', result, room=request.sid)

    if not result.get('success'):
        return

    _emit_private_states(room)

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
    """Compatibility alias: passing belongs to the simultaneous commit step."""
    code = data.get('room_code')
    if code not in game_rooms:
        return
    room = game_rooms[code]
    ok, message = GameEngine.commit_phase_cards(room, request.sid, [])
    if not ok:
        return emit('error', {'message': message})
    emit('phase_committed', {'rank': room.current_rank}, room=request.sid)
    committed, required = GameEngine.phase_commit_progress(room)
    emit('phase_progress', {
        'rank': room.current_rank,
        'committed': committed,
        'required': required,
    }, room=code)
    _finalize_phase_if_ready(code)


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
    elif pt == PromptType.GRAVEROBBER_PLAY:
        result = GameEngine.resolve_graverobber_play(room, resp.get('play_now', False))
    elif pt == PromptType.TROUBLEMAKER_REVEAL:
        result = GameEngine.resolve_troublemaker_reveal(room, resp.get('reveal', False))
    elif pt == PromptType.SOUL_MERCHANT_CHOICE:
        result = GameEngine.resolve_soul_merchant_choice(room, resp.get('choice', 'house'))
    elif pt == PromptType.SOUL_MERCHANT_SWAP:
        result = GameEngine.resolve_soul_merchant_swap(
            room,
            resp.get('swap', False),
            resp.get('own_index'),
            resp.get('target_index'),
        )
    elif pt == PromptType.SHAPESHIFTER_SWAP:
        result = GameEngine.resolve_shapeshifter_swap(room, resp.get('swap', False))

    if result:
        # Private result to prompted player
        emit('action_result', result, room=request.sid)
        if not result.get('success'):
            if room.pending_prompt:
                emit('prompt', room.pending_prompt.to_dict(), room=request.sid)
            return
        player = room.get_player_by_sid(request.sid)
        if player:
            GameEngine._record_private_knowledge(
                room, player, result.get('effects', [])
            )
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
    _emit_private_states(room)
    effects = [e for e in result.get('effects', [])
               if e.get('type') in ('kill', 'kill_reflected', 'martyr_death',
                                    'reveal_house_public', 'swap_identity',
                                    'steal_score', 'swap_score')]
    emit('prompt_resolved', {
        'public_message': pub,
        'effects': effects,
        'room': room.to_dict(),
    }, room=code)


def _emit_private_states(room: GameRoom):
    """Refresh each connected player's own hidden hand and score values."""
    for player in room.players:
        if not player.connected:
            continue
        emit('private_state', {
            'cards': [card.to_dict() for card in player.hand],
            'score_tokens': list(player.score_tokens),
            'total_score': player.total_score(),
        }, room=player.sid)


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

    _begin_phase_commit(code)


def _broadcast_draft_advance(code: str):
    """Continue after an automatic selection from a disconnected player."""
    room = game_rooms.get(code)
    if not room:
        return
    if room.phase == GamePhase.NIGHT:
        _start_night_broadcast(code)
        return
    for player in room.players:
        if not player.connected:
            continue
        cards = room.draft_state.get('hands', {}).get(player.sid, [])
        emit('draft_continued', {
            'round': room.draft_state.get('round', 2),
            'cards': [card.to_dict() for card in cards],
        }, room=player.sid)


def _begin_phase_commit(code: str):
    """Ask every living player for a secret play/pass decision."""
    room = game_rooms[code]
    room.night_stage = 'committing'
    room.phase_commitments = {}
    GameEngine._auto_commit_disconnected(room)

    emit('rank_changed', {
        'current_rank': room.current_rank,
        'night_stage': 'committing',
    }, room=code)
    for player in room.get_alive_players():
        if not player.connected:
            continue
        emit('phase_selection', {
            'rank': room.current_rank,
            'eligible_cards': [card.to_dict() for card in
                               GameEngine.eligible_phase_cards(room, player)],
        }, room=player.sid)


def _finalize_phase_if_ready(code: str):
    room = game_rooms.get(code)
    if not room or not GameEngine.phase_commit_complete(room):
        return
    queue = GameEngine.finalize_phase_commitments(room)
    emit('phase_revealed', {
        'rank': room.current_rank,
        'plays': [{
            'player_sid': action['sid'],
            'player_name': room.get_player_by_sid(action['sid']).name,
            'card': action['card'].to_dict(),
        } for action in queue],
    }, room=code)
    _process_night(code)


def _process_night(code: str):
    """Advance night phase: check prompts, send turns, or end round."""
    if code not in game_rooms:
        return
    room = game_rooms[code]

    # If there's a pending prompt, send it and wait
    if room.pending_prompt:
        target_sid = room.pending_prompt.target_sid
        target = room.get_player_by_sid(target_sid)
        if target and not target.away:
            # A target inside the reconnect grace period gets the prompt
            # re-sent on reconnect; the grace timer resolves it otherwise.
            emit('prompt', room.pending_prompt.to_dict(), room=target_sid)
        else:
            # Target gone past the grace period – auto-resolve
            result = GameEngine.auto_resolve_prompt(room)
            if result:
                _broadcast_prompt_result(code, result)
                _process_night(code)  # recurse
        return

    # No prompt – try next action
    nxt = GameEngine.get_current_action(room)
    if nxt:
        _send_action_turn(code)
    elif room.night_stage == 'resolving':
        if GameEngine.advance_night_rank(room):
            _begin_phase_commit(code)
        else:
            _end_night(code)


def _send_action_turn(code: str):
    """Notify about the current action turn."""
    room = game_rooms[code]
    cur = GameEngine.get_current_action(room)
    if not cur:
        _process_night(code)
        return

    rank = room.current_rank
    number = cur['card'].number
    active_sid = cur['sid']

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
        p.known_house_card = type(p.house_card)(p.house_card.house, p.house_card.number)

    # Determine winner
    outcome = GameEngine.determine_winner(room)
    awards = GameEngine.distribute_scores(room, outcome)

    room.phase = GamePhase.SCORING

    # Build score board
    scores = []
    for p in room.players:
        scores.append({
            'sid': p.sid,
            'name': p.name,
            'avatar': p.avatar,
            'alive': p.alive,
            # Killed players never reveal their house unless an earlier card
            # made it public.
            'house': (p.house_card.to_dict()
                      if p.house_card and p.house_revealed else None),
            'total_score': p.total_score(),
            'score_count': len(p.score_tokens),
        })
    scores.sort(key=lambda x: x['total_score'], reverse=True)

    # Send each player their own token details
    host = room.get_player_by_sid(room.host_sid)
    room.last_round_results = {}
    for p in room.players:
        payload = {
            'winning_house': (outcome.winning_house.value
                              if outcome.winning_house else None),
            'winners': [w.name for w in outcome.faction_winners],
            'ronin_winners': [r.name for r in outcome.ronin_winners],
            'full_tie': outcome.full_tie,
            'your_award': awards.get(p.sid),
            'scores': scores,
            'your_score_tokens': list(p.score_tokens),
            'your_total': p.total_score(),
            'can_start_next_round': (p.sid == room.host_sid or
                                     not host or not host.connected),
            'round_log': room.round_log,
        }
        room.last_round_results[p.player_id] = payload
        emit('round_complete', payload, room=p.sid)

    # Check game over
    game_winners = GameEngine.check_game_over(room)
    if game_winners:
        room.phase = GamePhase.GAME_OVER
        room.last_game_over = {
            'winners': [{
                'name': winner.name,
                'sid': winner.sid,
                'score': winner.total_score(),
            } for winner in game_winners],
            # Kept for older clients.
            'winner_name': game_winners[0].name,
            'winner_sid': game_winners[0].sid,
            'winner_score': game_winners[0].total_score(),
            'scores': scores,
        }
        emit('game_over', room.last_game_over, room=code)
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
        host = room.get_player_by_sid(room.host_sid)
        if host and host.connected:
            return
        # A permanently disconnected host must not strand the table between
        # rounds.  The first connected player to continue becomes host.
        room.host_sid = request.sid
    if room.phase not in (GamePhase.SCORING, GamePhase.REVEAL):
        return

    GameEngine.start_round(room)

    for p in room.players:
        emit('new_round', {
            'round': room.round_number,
            'your_house': p.known_house_card.to_dict(),
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
    port = int(os.environ.get('PORT', '5001'))
    debug = os.environ.get('FLASK_DEBUG', '').lower() in ('1', 'true', 'yes')
    print("🎴 忍者之夜 Online 服务器启动中…")
    print(f"🌐 http://localhost:{port}")
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=debug,
        allow_unsafe_werkzeug=debug,
    )
