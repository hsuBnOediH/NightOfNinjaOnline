// ── Night of Ninja Online – main entry ───────────────────────────────────────

import { gameState, resetRoundState } from './modules/state.js';
import { HOUSE_INFO, RANK_NAMES, getCardName, getHouseName } from './modules/constants.js';
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
import { t, initI18n, getLang } from './modules/i18n.js';
import { initTutorial, openTutorial } from './modules/tutorial.js';

// Wire up cross-module references (avoids circular imports)
setEmitFn(emit);
setUtilsModule({ showInfoModal });

// ═══════════════════════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    initI18n();
    initSocket();
    setupUI();
    generateAvatarGrid();
    autoFillPlayerInfo();
    initTutorial();
});

// ── Random name generator ────────────────────────────────────────────────────

const RANDOM_NAMES = {
    zh: {
        adj: ['暗影', '疾风', '雷鸣', '幻月', '烈焰', '寒冰', '紫电', '苍狼', '赤龙', '玄武',
            '飞羽', '碧空', '流星', '鬼面', '铁拳', '银蛇', '金鹰', '黑夜', '白虎', '青竹'],
        noun: ['忍者', '武士', '剑客', '刺客', '影侠', '浪人', '猎手', '行者', '隐士', '修罗',
            '鬼刃', '夜鹰', '风魔', '月刃', '天狗', '般若', '枫叶', '樱花', '雪狐', '火影'],
    },
    en: {
        adj: ['Shadow', 'Storm', 'Silent', 'Swift', 'Dark', 'Iron', 'Crimson', 'Frost', 'Ghost', 'Steel',
            'Moon', 'Thunder', 'Ember', 'Night', 'Jade', 'Onyx', 'Silver', 'Brave', 'Rogue', 'Wild'],
        noun: ['Ninja', 'Blade', 'Hawk', 'Wolf', 'Fox', 'Viper', 'Ronin', 'Fang', 'Strike', 'Lotus',
            'Crane', 'Fury', 'Claw', 'Shuriken', 'Katana', 'Samurai', 'Tiger', 'Raven', 'Spirit', 'Arrow'],
    },
};

function generateRandomName() {
    const lang = getLang();
    const pool = RANDOM_NAMES[lang] || RANDOM_NAMES.zh;
    const adj = pool.adj[Math.floor(Math.random() * pool.adj.length)];
    const noun = pool.noun[Math.floor(Math.random() * pool.noun.length)];
    return lang === 'zh' ? `${adj}${noun}` : `${adj}${noun}`;
}

function autoFillPlayerInfo() {
    const nameInput = $('player-name');
    if (nameInput && !nameInput.value) {
        nameInput.value = generateRandomName();
    }
    // Random avatar
    const idx = Math.floor(Math.random() * 12) + 1;
    gameState.myAvatar = idx;
    const opts = document.querySelectorAll('.avatar-option');
    opts.forEach(o => o.classList.remove('selected'));
    if (opts[idx - 1]) opts[idx - 1].classList.add('selected');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SOCKET WIRING
// ═══════════════════════════════════════════════════════════════════════════════

function initSocket() {
    initializeSocket({
        room_created: onRoomCreated,
        room_joined: onRoomJoined,
        player_joined: onPlayerJoined,
        player_left: onPlayerLeft,
        player_disconnected: onPlayerDisconnected,
        player_reconnected: onPlayerReconnected,
        room_updated: onRoomUpdated,
        room_closed: onRoomClosed,
        reconnected: onReconnected,
        game_started: onGameStarted,
        draft_started: onDraftStarted,
        draft_continued: onDraftContinued,
        night_started: onNightStarted,
        your_hand: onYourHand,
        action_turn: onActionTurn,
        rank_changed: onRankChanged,
        turn_notification: onTurnNotification,
        card_played: onCardPlayed,
        action_skipped: onActionSkipped,
        action_result: handleActionResult,
        prompt: handlePrompt,
        prompt_resolved: onPromptResolved,
        round_complete: onRoundComplete,
        new_round: onNewRound,
        game_over: onGameOver,
        error: (d) => { toast(d.message || t('error_generic'), 4000); },
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
    $('close-info-btn').onclick = () => hideModal('info-modal');

    // Settings
    const thr = $('winning-threshold');
    if (thr) thr.addEventListener('change', (e) => {
        if (gameState.isHost) emit('update_settings', {
            room_code: gameState.roomCode,
            settings: { winning_threshold: e.target.value },
        });
    });

    // Tutorial
    const tutBtn = $('tutorial-btn');
    if (tutBtn) tutBtn.addEventListener('click', openTutorial);
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
    navigator.clipboard.writeText(code).then(() => toast(t('room_code_copied'))).catch(() => { });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LOBBY ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function createRoom() {
    const name = $('player-name').value.trim();
    if (!name) return toast(t('enter_name'));
    gameState.myName = name;
    emit('create_room', { name, avatar: gameState.myAvatar });
}

function joinRoom() {
    const name = $('player-name').value.trim();
    const code = $('room-code-input').value.trim().toUpperCase();
    if (!name) return toast(t('enter_name'));
    if (!code || code.length !== 4) return toast(t('enter_room_code'));
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
    toast(t('player_joined_room', d.player.name));
    addLog(t('player_joined_room', d.player.name));
}

function onPlayerLeft(d) {
    updatePlayerList(d.room.players);
    addLog(t('player_left_room', d.player.name));
}

function onPlayerDisconnected(d) {
    toast(t('player_disconnected', d.name));
    addLog(t('player_disconnected_short', d.name));
    if (d.room) updatePlayerBoard(d.room.players);
}

function onPlayerReconnected(d) {
    toast(t('player_reconnected', d.player.name));
    addLog(t('player_reconnected_short', d.player.name));
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
    toast(d.reason || t('room_closed'));
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
    toast(t('reconnect_success'));
}

// ── Game start ───────────────────────────────────────────────────────────────

function onGameStarted(d) {
    gameState.myHouse = d.your_house;
    gameState.phase = 'assignment';
    gameState.roundNumber = d.room.round_number;
    resetRoundState();

    applyHouseDisplay(d.your_house);
    showScreen('game-screen');
    updateStageGuidance(t('house_assignment'), t('house_assigned_desc'));
    const wd = $('win-threshold-display');
    if (wd) wd.textContent = d.room.winning_threshold || gameState.winningThreshold;
    updatePlayerBoard(d.room.players);
    addLog(t('game_started_log'));
}

function applyHouseDisplay(house) {
    if (!house) return;
    const houseName = getHouseName(house.house);
    const hi = HOUSE_INFO[house.house] || {};
    const img = $('house-img');
    const nm = $('house-name');
    const tier = $('house-tier');
    if (img) img.src = `/static/img/${house.house}.png`;
    if (nm) { nm.textContent = houseName; nm.style.color = hi.color || '#fff'; }
    if (tier) tier.textContent = house.number ? t('house_tier', house.number) : '';
}

// ── Drafting ─────────────────────────────────────────────────────────────────

function onDraftStarted(d) {
    gameState.phase = 'drafting';
    gameState.draftRound = d.round;
    gameState.currentDraftCards = d.cards;
    if (d.round === 1) gameState.draftedCards = [];

    $('phase-indicator').textContent = t('draft_phase', d.round);
    $('draft-collection-panel').style.display = 'block';
    updateDraftCollection();
    renderDraftCards(d.cards, d.round);
    updateStageGuidance(t('draft_phase', d.round), t('draft_received', d.cards.length));
    addLog(t('draft_round_log', d.round, d.cards.length));
}

function onDraftContinued(d) {
    gameState.draftRound = d.round;
    gameState.currentDraftCards = d.cards;
    renderDraftCards(d.cards, d.round);
    $('phase-indicator').textContent = t('draft_phase', d.round);
    updateStageGuidance(t('draft_phase', d.round), t('draft_received', d.cards.length));
}

function renderDraftCards(cards, round) {
    const hand = $('card-hand');
    const title = $('hand-title');
    hand.innerHTML = '';
    if (!cards.length) {
        title.textContent = t('waiting_others_select');
        return;
    }
    title.textContent = t('draft_select_prompt', round);
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
    $('phase-indicator').textContent = t('night_phase', rn);
    updateStageGuidance(t('night_phase', rn), t('waiting_action'));
    updatePlayerBoard(d.room.players);
    addLog(t('night_started'));
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
        title.textContent = t('you_died');
        title.style.color = 'var(--danger)';
        return;
    }

    if (d.player_sid === gameState.mySid) {
        title.innerHTML = `${t('your_turn')}<button id="skip-btn" class="btn btn-secondary" style="margin-left:12px;padding:4px 14px;font-size:.8em;">${t('skip')}</button>`;
        title.style.color = 'var(--success)';
        toast(t('your_turn'), 2000);

        $('skip-btn').onclick = () => {
            showConfirm(t('confirm_skip'), t('skip_turn'), () => {
                emit('skip_turn', { room_code: gameState.roomCode });
            });
        };
    } else {
        title.textContent = t('waiting_others_action');
        title.style.color = 'var(--text-secondary)';
    }
}

function onRankChanged(d) {
    gameState.currentRank = d.current_rank;
    const rn = getRankName(d.current_rank);
    $('phase-indicator').textContent = t('night_phase', rn);
    updateStageGuidance(t('night_phase', rn), t('waiting_action'));
    addLog(t('rank_phase', rn));
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
    addLog(d.message || t('player_skipped'));
    if (d.player_sid === gameState.mySid) {
        $('hand-title').textContent = t('waiting_others_action');
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
    updateStageGuidance(t('round_scoring'), t('view_results'));
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
    updateStageGuidance(t('new_round'), t('waiting_draft'));
    addLog(t('round_number', d.round));
}

function onGameOver(d) {
    gameState.phase = 'game_over';
    let html = `<div style="text-align:center;font-size:1.5em;margin-bottom:20px;">${t('winner_announce', d.winner_name, d.winner_score)}</div>`;
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.1);"><th style="text-align:left;padding:6px;">#</th><th style="text-align:left;">${t('player_col_short')}</th><th>${t('total_score_short')}</th></tr>`;
    (d.scores || []).forEach((s, i) => {
        const isMe = s.sid === gameState.mySid;
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);${isMe ? 'background:rgba(255,255,255,0.05);' : ''}">`;
        html += `<td style="padding:6px;">${i + 1}</td>`;
        html += `<td>${s.name}</td>`;
        html += `<td style="text-align:center;font-weight:bold;">${s.total_score}</td>`;
        html += '</tr>';
    });
    html += '</table>';
    html += `<div style="text-align:center;margin-top:24px;"><button class="btn btn-primary" onclick="location.reload()">${t('back_to_lobby')}</button></div>`;
    showInfoModal(t('game_over'), html);
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
