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
    showModal, hideModal, showInfoModal, showConfirm, toast, escapeHtml,
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
        phase_selection: onPhaseSelection,
        phase_committed: onPhaseCommitted,
        phase_progress: onPhaseProgress,
        phase_revealed: onPhaseRevealed,
        your_hand: onYourHand,
        private_state: onPrivateState,
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
    $('leave-room-btn').addEventListener('click', () => {
        // Refreshing is a temporary disconnect; this button is an explicit exit.
        emit('leave_room', { room_code: gameState.roomCode });
        sessionStorage.removeItem('player_id');
        sessionStorage.removeItem('room_code');
        setTimeout(() => location.reload(), 150);
    });
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
    if (!d.room) return;
    gameState.phase = d.room.phase;
    if (d.room.phase === 'lobby') updatePlayerList(d.room.players);
    else updatePlayerBoard(d.room.players);
}

function onPlayerReconnected(d) {
    toast(t('player_reconnected', d.player.name));
    addLog(t('player_reconnected_short', d.player.name));
    if (!d.room) return;
    if (d.old_sid && d.old_sid !== d.player.sid && gameState.revealedInfo[d.old_sid]) {
        gameState.revealedInfo[d.player.sid] = gameState.revealedInfo[d.old_sid];
        delete gameState.revealedInfo[d.old_sid];
    }
    gameState.phase = d.room.phase;
    if (d.room.phase === 'lobby') updatePlayerList(d.room.players);
    else updatePlayerBoard(d.room.players);
}

function onRoomUpdated(d) {
    if (!d.room) return;
    gameState.isHost = d.room.host_sid === gameState.mySid;
    gameState.winningThreshold = d.room.winning_threshold;
    const thr = $('winning-threshold');
    if (thr) thr.value = d.room.winning_threshold;
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
    gameState.isHost = d.room.host_sid === gameState.mySid;
    gameState.nightStage = d.room.night_stage || 'idle';
    gameState.revealedInfo = Object.fromEntries(
        Object.entries(d.known_houses || {}).map(([sid, house]) => [sid, { house }]),
    );
    Object.entries(d.known_scores || {}).forEach(([sid, scores]) => {
        if (!gameState.revealedInfo[sid]) gameState.revealedInfo[sid] = {};
        gameState.revealedInfo[sid].scores = scores;
    });
    const me = (d.room.players || []).find(player => player.sid === gameState.mySid);
    gameState.myScoreTokens = me?.score_tokens || [];
    gameState.myTotalScore = me?.total_score || 0;
    updateOwnScoreDisplay();
    (d.room.players || []).forEach(player => {
        if (player.house_revealed && player.house) {
            gameState.revealedInfo[player.sid] = { house: player.house };
        }
    });

    onRoomUpdated(d);
    $('display-room-code').textContent = d.room_code;

    if (d.room.phase === 'lobby') {
        $('start-game-btn').style.display = gameState.isHost ? 'block' : 'none';
        updatePlayerList(d.room.players);
        showScreen('waiting-screen');
        toast(t('reconnect_success'));
        return;
    }

    showScreen('game-screen');
    applyHouseDisplay(d.your_house);
    updatePlayerBoard(d.room.players);
    gameState.roundNumber = d.room.round_number;
    $('round-number').textContent = d.room.round_number;
    if (d.room.phase === 'drafting') {
        // Kept draft picks live in the server-side hand; draft_started /
        // draft_continued follow this event and restore the indicator.
        gameState.draftedCards = [...gameState.myHand];
        $('draft-collection-panel').style.display = 'block';
        updateDraftCollection();
    } else if (d.room.phase === 'night') {
        gameState.currentRank = d.room.current_rank;
        $('draft-collection-panel').style.display = 'none';
        const rn = getRankName(d.room.current_rank);
        $('phase-indicator').textContent = t('night_phase', rn);
        updateStageGuidance(t('night_phase', rn), t('waiting_action'));
    } else if (d.room.phase === 'scoring' || d.room.phase === 'game_over') {
        $('draft-collection-panel').style.display = 'none';
        $('phase-indicator').textContent = t('round_scoring');
    }
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
    gameState.nightStage = 'committing';
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
    updateOwnScoreDisplay();
}

function onPrivateState(d) {
    gameState.myHand = d.cards || [];
    gameState.myScoreTokens = d.score_tokens || [];
    gameState.myTotalScore = d.total_score || 0;
    renderHand(gameState.myHand);
    updateOwnScoreDisplay();
}

function updateOwnScoreDisplay() {
    const st = $('my-honor-total');
    const sc = $('my-honor-count');
    if (st) st.textContent = gameState.myTotalScore;
    if (sc) sc.textContent = gameState.myScoreTokens.length;
}

function onPhaseSelection(d) {
    gameState.currentRank = d.rank;
    gameState.nightStage = 'committing';
    gameState.currentAction = null;
    gameState.eligiblePhaseCards = d.eligible_cards || [];
    gameState.selectedPhaseCardIds = [];
    gameState.phaseCommitted = false;
    renderHand(gameState.myHand);
}

function onPhaseCommitted() {
    gameState.phaseCommitted = true;
    renderHand(gameState.myHand);
    $('hand-title').textContent = t('choice_locked_waiting');
}

function onPhaseProgress(d) {
    updateStageGuidance(
        t('night_phase', getRankName(d.rank)),
        t('phase_progress', d.committed, d.required),
    );
}

function onPhaseRevealed(d) {
    gameState.nightStage = 'resolving';
    gameState.phaseCommitted = true;
    const plays = d.plays || [];
    if (!plays.length) {
        addLog(t('no_cards_this_phase'));
    } else {
        plays.forEach(play => addLog(t(
            'phase_card_revealed',
            play.player_name,
            getCardName(play.card),
            play.card.number || '?',
        )));
    }
    renderHand(gameState.myHand);
}

function onActionTurn(d) {
    gameState.currentRank = d.rank;
    gameState.currentAction = d;
    gameState.nightStage = 'resolving';
    renderHand(gameState.myHand);

    const title = $('hand-title');
    const me = (gameState.players || []).find(p => p.sid === gameState.mySid);
    if (me && !me.alive) {
        title.textContent = t('you_died');
        title.style.color = 'var(--danger)';
        return;
    }

    if (d.player_sid === gameState.mySid) {
        title.textContent = t('resolve_committed_card');
        title.style.color = 'var(--success)';
        toast(t('your_turn'), 2000);
    } else {
        title.textContent = t('waiting_others_action');
        title.style.color = 'var(--text-secondary)';
    }
}

function onRankChanged(d) {
    gameState.currentRank = d.current_rank;
    gameState.nightStage = d.night_stage || 'committing';
    gameState.currentAction = null;
    const rn = getRankName(d.current_rank);
    $('phase-indicator').textContent = t('night_phase', rn);
    updateStageGuidance(t('night_phase', rn), t('waiting_action'));
    addLog(t('rank_phase', rn));
    renderHand(gameState.myHand);
}

function onTurnNotification(d) {
    gameState.currentAction = null;
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
        if (eff.type === 'swap_identity') {
            if (eff.actor_sid !== gameState.mySid) {
                delete gameState.revealedInfo[eff.t1];
                delete gameState.revealedInfo[eff.t2];
            }
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
        if (eff.type === 'swap_identity') {
            if (eff.actor_sid !== gameState.mySid) {
                delete gameState.revealedInfo[eff.t1];
                delete gameState.revealedInfo[eff.t2];
            }
        }
    });
    if (d.room) updatePlayerBoard(d.room.players);
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function onRoundComplete(d) {
    gameState.phase = 'scoring';
    gameState.myScoreTokens = d.your_score_tokens || [];
    gameState.myTotalScore = d.your_total || 0;
    const st = $('my-honor-total');
    const sc = $('my-honor-count');
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
    const winners = d.winners?.length ? d.winners : [{ name: d.winner_name, score: d.winner_score }];
    const winnerNames = winners.map(w => escapeHtml(w.name)).join('、');
    let html = `<div style="text-align:center;font-size:1.5em;margin-bottom:20px;">${t('winner_announce', winnerNames, winners[0]?.score ?? 0)}</div>`;
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.1);"><th style="text-align:left;padding:6px;">#</th><th style="text-align:left;">${t('player_col_short')}</th><th>${t('total_score_short')}</th></tr>`;
    (d.scores || []).forEach((s, i) => {
        const isMe = s.sid === gameState.mySid;
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);${isMe ? 'background:rgba(255,255,255,0.05);' : ''}">`;
        html += `<td style="padding:6px;">${i + 1}</td>`;
        html += `<td>${escapeHtml(s.name)}</td>`;
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

    if (gameState.nightStage === 'committing') {
        const eligibleIds = new Set((gameState.eligiblePhaseCards || []).map(c => c.id));
        cards.forEach(c => {
            const canSelect = eligibleIds.has(c.id) && !gameState.phaseCommitted;
            const el = createCardElement(c, canSelect);
            if (gameState.selectedPhaseCardIds.includes(c.id)) {
                el.classList.add('selected-for-phase');
                el.style.boxShadow = '0 0 20px var(--accent)';
                el.style.border = '3px solid var(--accent)';
            }
            if (canSelect) {
                el.onclick = () => {
                    const selected = gameState.selectedPhaseCardIds;
                    gameState.selectedPhaseCardIds = selected.includes(c.id)
                        ? selected.filter(id => id !== c.id)
                        : [...selected, c.id];
                    renderHand(cards);
                };
            }
            hand.appendChild(el);
        });

        if (gameState.phaseCommitted) {
            title.textContent = t('choice_locked_waiting');
            return;
        }
        const count = gameState.selectedPhaseCardIds.length;
        title.innerHTML = '';
        const label = document.createElement('span');
        label.textContent = count ? t('selected_card_count', count) : t('choose_or_pass');
        const lock = document.createElement('button');
        lock.className = count ? 'btn btn-primary phase-lock-btn' : 'btn btn-secondary phase-lock-btn';
        lock.textContent = count ? t('lock_selected_cards') : t('pass_phase');
        lock.onclick = () => {
            lock.disabled = true;
            emit('commit_phase', {
                room_code: gameState.roomCode,
                card_ids: [...gameState.selectedPhaseCardIds],
            });
        };
        title.appendChild(label);
        title.appendChild(lock);
        return;
    }

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
