// ── Night of Ninja Online – main entry ───────────────────────────────────────

import { gameState, resetRoundState } from './modules/state.js';
import { HOUSE_INFO, RANK_NAMES, getCardName } from './modules/constants.js';
import { initializeSocket, emit } from './modules/socket.js';
import {
    showScreen, updatePlayerList, updatePlayerBoard,
    createCardElement, updateDraftCollection, showRoundResults,
    setEmitFn, setUtilsModule,
} from './modules/ui.js';
import {
    addLog, updateStageGuidance, getRankName,
    showModal, hideModal, showInfoModal, showConfirm, toast,
} from './modules/utils.js';
import { selectDraftCard, playCard, handlePrompt, handleActionResult } from './modules/game.js';

// Wire up cross-module references (avoids circular imports)
setEmitFn(emit);
setUtilsModule({ showInfoModal });

// ═══════════════════════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    setupUI();
    generateAvatarGrid();
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SOCKET WIRING
// ═══════════════════════════════════════════════════════════════════════════════

function initSocket() {
    initializeSocket({
        room_created:        onRoomCreated,
        room_joined:         onRoomJoined,
        player_joined:       onPlayerJoined,
        player_left:         onPlayerLeft,
        player_disconnected: onPlayerDisconnected,
        player_reconnected:  onPlayerReconnected,
        room_updated:        onRoomUpdated,
        room_closed:         onRoomClosed,
        reconnected:         onReconnected,
        game_started:        onGameStarted,
        draft_started:       onDraftStarted,
        draft_continued:     onDraftContinued,
        night_started:       onNightStarted,
        your_hand:           onYourHand,
        action_turn:         onActionTurn,
        rank_changed:        onRankChanged,
        turn_notification:   onTurnNotification,
        card_played:         onCardPlayed,
        action_skipped:      onActionSkipped,
        action_result:       handleActionResult,
        prompt:              handlePrompt,
        prompt_resolved:     onPromptResolved,
        round_complete:      onRoundComplete,
        new_round:           onNewRound,
        game_over:           onGameOver,
        error:               (d) => { toast(d.message || '错误', 4000); },
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UI SETUP
// ═══════════════════════════════════════════════════════════════════════════════

function setupUI() {
    // Create / Join
    $('create-room-btn').addEventListener('click', createRoom);
    $('join-room-btn').addEventListener('click', joinRoom);

    const codeInput = $('room-code-input');
    codeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        $('create-room-btn').style.display = e.target.value ? 'none' : 'block';
        $('join-room-btn').style.display = e.target.value ? 'block' : 'none';
    });

    // Enter key
    $('player-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') codeInput.value ? joinRoom() : createRoom();
    });
    codeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.target.value) joinRoom();
    });

    // Copy code
    $('copy-room-btn').addEventListener('click', copyRoomCode);
    $('display-room-code').addEventListener('click', copyRoomCode);

    // Leave / Start
    $('leave-room-btn').addEventListener('click', () => location.reload());
    $('start-game-btn').addEventListener('click', () => {
        emit('start_game', { room_code: gameState.roomCode });
    });

    // Modals
    $('cancel-target-btn').onclick = () => hideModal('target-modal');
    $('close-info-btn').onclick   = () => hideModal('info-modal');

    // Settings
    const thr = $('winning-threshold');
    if (thr) thr.addEventListener('change', (e) => {
        if (gameState.isHost) emit('update_settings', {
            room_code: gameState.roomCode,
            settings: { winning_threshold: e.target.value },
        });
    });
}

function generateAvatarGrid() {
    const grid = $('avatar-grid');
    if (!grid) return;
    for (let i = 1; i <= 12; i++) {
        const opt = document.createElement('div');
        opt.className = 'avatar-option';
        if (i === gameState.myAvatar) opt.classList.add('selected');
        opt.innerHTML = `<img src="/static/img/avatar_${i}.png" alt="Avatar ${i}">`;
        opt.onclick = () => {
            grid.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            gameState.myAvatar = i;
        };
        grid.appendChild(opt);
    }
}

function copyRoomCode() {
    const code = $('display-room-code').textContent;
    navigator.clipboard.writeText(code).then(() => toast('房间代码已复制')).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LOBBY ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function createRoom() {
    const name = $('player-name').value.trim();
    if (!name) return toast('请输入你的名字');
    gameState.myName = name;
    emit('create_room', { name, avatar: gameState.myAvatar });
}

function joinRoom() {
    const name = $('player-name').value.trim();
    const code = $('room-code-input').value.trim().toUpperCase();
    if (!name) return toast('请输入你的名字');
    if (!code || code.length !== 4) return toast('请输入4位房间代码');
    gameState.myName = name;
    emit('join_room', { room_code: code, name, avatar: gameState.myAvatar });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SOCKET HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

function onRoomCreated(d) {
    gameState.roomCode = d.room_code;
    gameState.isHost = true;
    gameState.playerId = d.player_id;
    sessionStorage.setItem('player_id', d.player_id);
    sessionStorage.setItem('room_code', d.room_code);
    $('display-room-code').textContent = d.room_code;
    $('start-game-btn').style.display = 'block';
    onRoomUpdated(d);
    updatePlayerList(d.room.players);
    showScreen('waiting-screen');
}

function onRoomJoined(d) {
    gameState.roomCode = d.room_code;
    gameState.isHost = false;
    gameState.playerId = d.player_id;
    sessionStorage.setItem('player_id', d.player_id);
    sessionStorage.setItem('room_code', d.room_code);
    $('display-room-code').textContent = d.room_code;
    onRoomUpdated(d);
    updatePlayerList(d.room.players);
    showScreen('waiting-screen');
}

function onPlayerJoined(d) {
    updatePlayerList(d.room.players);
    toast(`${d.player.name} 加入了房间`);
    addLog(`${d.player.name} 加入了房间`);
}

function onPlayerLeft(d) {
    updatePlayerList(d.room.players);
    addLog(`${d.player.name} 离开了房间`);
}

function onPlayerDisconnected(d) {
    toast(`${d.name} 掉线了`);
    addLog(`${d.name} 掉线`);
    if (d.room) updatePlayerBoard(d.room.players);
}

function onPlayerReconnected(d) {
    toast(`${d.player.name} 重新连接`);
    addLog(`${d.player.name} 重连`);
    if (d.room) updatePlayerBoard(d.room.players);
}

function onRoomUpdated(d) {
    if (!d.room) return;
    gameState.winningThreshold = d.room.winning_threshold;
    const thr = $('winning-threshold');
    if (thr && !gameState.isHost) thr.value = d.room.winning_threshold;
    const disp = $('win-threshold-display');
    if (disp) disp.textContent = d.room.winning_threshold;
}

function onRoomClosed(d) {
    toast(d.reason || '房间已关闭');
    sessionStorage.removeItem('player_id');
    sessionStorage.removeItem('room_code');
    setTimeout(() => location.reload(), 2000);
}

function onReconnected(d) {
    gameState.roomCode = d.room_code;
    gameState.myHouse = d.your_house;
    gameState.myHand = d.your_hand || [];
    gameState.phase = d.room.phase;
    gameState.players = d.room.players;

    showScreen('game-screen');
    applyHouseDisplay(d.your_house);
    updatePlayerBoard(d.room.players);
    renderHand(gameState.myHand);
    toast('重新连接成功');
}

// ── Game start ───────────────────────────────────────────────────────────────

function onGameStarted(d) {
    gameState.myHouse = d.your_house;
    gameState.phase = 'assignment';
    gameState.roundNumber = d.room.round_number;
    resetRoundState();

    applyHouseDisplay(d.your_house);
    showScreen('game-screen');
    updateStageGuidance('流派分配', '你已收到流派卡，等待轮抽开始');
    const wd = $('win-threshold-display');
    if (wd) wd.textContent = d.room.winning_threshold || gameState.winningThreshold;
    updatePlayerBoard(d.room.players);
    addLog('游戏开始！查看你的流派卡');
}

function applyHouseDisplay(house) {
    if (!house) return;
    const hi = HOUSE_INFO[house.house] || {};
    const img = $('house-img');
    const nm  = $('house-name');
    const tier = $('house-tier');
    if (img) img.src = `/static/img/${house.house}.png`;
    if (nm) { nm.textContent = hi.name || '???'; nm.style.color = hi.color || '#fff'; }
    if (tier) tier.textContent = house.number ? `等级 ${house.number}` : '';
}

// ── Drafting ─────────────────────────────────────────────────────────────────

function onDraftStarted(d) {
    gameState.phase = 'drafting';
    gameState.draftRound = d.round;
    gameState.currentDraftCards = d.cards;
    if (d.round === 1) gameState.draftedCards = [];

    $('phase-indicator').textContent = `轮抽阶段 ${d.round}/2`;
    $('draft-collection-panel').style.display = 'block';
    updateDraftCollection();
    renderDraftCards(d.cards, d.round);
    updateStageGuidance(`轮抽阶段 ${d.round}/2`, `收到 ${d.cards.length} 张卡牌，选择 1 张保留`);
    addLog(`轮抽第 ${d.round} 轮：${d.cards.length} 张卡牌`);
}

function onDraftContinued(d) {
    gameState.draftRound = d.round;
    gameState.currentDraftCards = d.cards;
    renderDraftCards(d.cards, d.round);
    $('phase-indicator').textContent = `轮抽阶段 ${d.round}/2`;
    updateStageGuidance(`轮抽阶段 ${d.round}/2`, `收到 ${d.cards.length} 张卡牌，选择 1 张保留`);
}

function renderDraftCards(cards, round) {
    const hand = $('card-hand');
    const title = $('hand-title');
    hand.innerHTML = '';
    if (!cards.length) {
        title.textContent = '等待其他玩家选择…';
        return;
    }
    title.textContent = `第 ${round}/2 轮：选择 1 张保留`;
    cards.forEach((card, idx) => {
        const el = createCardElement(card, true);
        el.onclick = () => selectDraftCard(idx, card, cards);
        hand.appendChild(el);
    });
}

// ── Night phase ──────────────────────────────────────────────────────────────

function onNightStarted(d) {
    gameState.phase = 'night';
    gameState.currentRank = d.current_rank;
    gameState.roundNumber = d.round;
    $('draft-collection-panel').style.display = 'none';
    $('round-number').textContent = d.round;
    const rn = getRankName(d.current_rank);
    $('phase-indicator').textContent = `夜晚阶段 - ${rn}`;
    updateStageGuidance(`夜晚阶段 - ${rn}`, '等待行动…');
    updatePlayerBoard(d.room.players);
    addLog('夜晚阶段开始！');
}

function onYourHand(d) {
    gameState.myHand = d.cards;
    renderHand(d.cards);
    // Update score display
    const me = (gameState.players || []).find(p => p.sid === gameState.mySid);
    if (me) {
        const st = $('my-score-total');
        const sc = $('my-score-count');
        if (st) st.textContent = me.total_score ?? gameState.myTotalScore;
        if (sc) sc.textContent = me.score_count ?? 0;
    }
}

function onActionTurn(d) {
    gameState.currentRank = d.rank;
    gameState.currentAction = d;
    renderHand(gameState.myHand);

    const title = $('hand-title');
    const me = (gameState.players || []).find(p => p.sid === gameState.mySid);
    if (me && !me.alive) {
        title.textContent = '你已死亡，等待回合结束…';
        title.style.color = 'var(--danger)';
        return;
    }

    if (d.player_sid === gameState.mySid) {
        title.innerHTML = `轮到你了！<button id="skip-btn" class="btn btn-secondary" style="margin-left:12px;padding:4px 14px;font-size:.8em;">跳过</button>`;
        title.style.color = 'var(--success)';
        toast('轮到你行动了！', 2000);

        $('skip-btn').onclick = () => {
            showConfirm('确认跳过？卡牌将保留在手中（本阶段不可再使用）。', '跳过回合', () => {
                emit('skip_turn', { room_code: gameState.roomCode });
            });
        };
    } else {
        title.textContent = '等待其他玩家行动…';
        title.style.color = 'var(--text-secondary)';
    }
}

function onRankChanged(d) {
    gameState.currentRank = d.current_rank;
    const rn = getRankName(d.current_rank);
    $('phase-indicator').textContent = `夜晚阶段 - ${rn}`;
    updateStageGuidance(`夜晚阶段 - ${rn}`, '等待行动…');
    addLog(`—— ${rn} 阶段 ——`);
    renderHand(gameState.myHand);
}

function onTurnNotification(d) {
    $('hand-title').textContent = d.message;
    $('hand-title').style.color = 'var(--text-secondary)';
}

function onCardPlayed(d) {
    if (d.public_message) addLog(d.public_message);
    // Process public effects
    (d.effects || []).forEach(eff => {
        if ((eff.type === 'kill' || eff.type === 'martyr_death' || eff.type === 'kill_reflected') && eff.target_sid) {
            const p = (gameState.players || []).find(x => x.sid === eff.target_sid);
            if (p) p.alive = false;
            if (eff.dead_sid) {
                const a = (gameState.players || []).find(x => x.sid === eff.dead_sid);
                if (a) a.alive = false;
            }
        }
        if (eff.type === 'reveal_house_public' && eff.house) {
            if (!gameState.revealedInfo[eff.target_sid]) gameState.revealedInfo[eff.target_sid] = {};
            gameState.revealedInfo[eff.target_sid].house = eff.house;
            const p = (gameState.players || []).find(x => x.sid === eff.target_sid);
            if (p) { p.house_revealed = true; p.house = eff.house; }
        }
    });
    if (d.room) updatePlayerBoard(d.room.players);
}

function onActionSkipped(d) {
    addLog(d.message || '玩家跳过');
    if (d.player_sid === gameState.mySid) {
        $('hand-title').textContent = '等待其他玩家行动…';
        $('hand-title').style.color = 'var(--text-secondary)';
    }
    renderHand(gameState.myHand);
}

function onPromptResolved(d) {
    if (d.public_message) addLog(d.public_message);
    (d.effects || []).forEach(eff => {
        if ((eff.type === 'kill' || eff.type === 'martyr_death') && eff.target_sid) {
            const p = (gameState.players || []).find(x => x.sid === eff.target_sid);
            if (p) p.alive = false;
        }
        if (eff.type === 'kill_reflected' && eff.dead_sid) {
            const a = (gameState.players || []).find(x => x.sid === eff.dead_sid);
            if (a) a.alive = false;
        }
        if (eff.type === 'reveal_house_public' && eff.house) {
            if (!gameState.revealedInfo[eff.target_sid]) gameState.revealedInfo[eff.target_sid] = {};
            gameState.revealedInfo[eff.target_sid].house = eff.house;
        }
    });
    if (d.room) updatePlayerBoard(d.room.players);
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function onRoundComplete(d) {
    gameState.phase = 'scoring';
    gameState.myScoreTokens = d.your_score_tokens || [];
    gameState.myTotalScore = d.your_total || 0;
    const st = $('my-score-total');
    const sc = $('my-score-count');
    if (st) st.textContent = gameState.myTotalScore;
    if (sc) sc.textContent = gameState.myScoreTokens.length;
    updateStageGuidance('回合结算', '查看本轮结果');
    showRoundResults(d);
}

function onNewRound(d) {
    hideModal('info-modal');
    gameState.myHouse = d.your_house;
    gameState.roundNumber = d.round;
    resetRoundState();
    applyHouseDisplay(d.your_house);
    updatePlayerBoard(d.room.players);
    $('round-number').textContent = d.round;
    updateStageGuidance('新回合', '等待轮抽开始');
    addLog(`—— 第 ${d.round} 回合 ——`);
}

function onGameOver(d) {
    gameState.phase = 'game_over';
    let html = `<div style="text-align:center;font-size:1.5em;margin-bottom:20px;">🏆 ${d.winner_name} 获胜！(${d.winner_score}分)</div>`;
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.1);"><th style="text-align:left;padding:6px;">#</th><th style="text-align:left;">玩家</th><th>总分</th></tr>';
    (d.scores || []).forEach((s, i) => {
        const isMe = s.sid === gameState.mySid;
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);${isMe ? 'background:rgba(255,255,255,0.05);' : ''}">`;
        html += `<td style="padding:6px;">${i + 1}</td>`;
        html += `<td>${s.name}</td>`;
        html += `<td style="text-align:center;font-weight:bold;">${s.total_score}</td>`;
        html += '</tr>';
    });
    html += '</table>';
    html += '<div style="text-align:center;margin-top:24px;"><button class="btn btn-primary" onclick="location.reload()">返回大厅</button></div>';
    showInfoModal('游戏结束', html);
    sessionStorage.removeItem('player_id');
    sessionStorage.removeItem('room_code');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HAND RENDERING
// ═══════════════════════════════════════════════════════════════════════════════

function renderHand(cards) {
    const hand = $('card-hand');
    const title = $('hand-title');

    if (gameState.phase !== 'night') {
        hand.innerHTML = '';
        cards.forEach(c => {
            hand.appendChild(createCardElement(c, false));
        });
        return;
    }

    hand.innerHTML = '';
    const act = gameState.currentAction;
    const isMyTurn = act && act.player_sid === gameState.mySid;

    cards.forEach(c => {
        let canPlay = false;
        if (isMyTurn && c.id === act.card_id) canPlay = true;

        const el = createCardElement(c, canPlay);
        if (canPlay) {
            el.style.boxShadow = '0 0 20px var(--accent)';
            el.style.border = '2px solid var(--accent)';
            el.onclick = () => playCard(c);
        }
        hand.appendChild(el);
    });
}

// ── tiny DOM helper ──────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
