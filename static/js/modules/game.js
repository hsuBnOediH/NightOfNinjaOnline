// ── Game actions: drafting, playing cards, target selection ──────────────────

import { gameState } from './state.js';
import { CARD_INFO, HOUSE_INFO, getCardName } from './constants.js';
import { emit } from './socket.js';
import { showModal, hideModal, showInfoModal, showConfirm, addLog, toast } from './utils.js';
import { createCardElement, updateDraftCollection, showPromptModal, hidePromptModal } from './ui.js';

let _selectionQueue = [];

// ── Draft card selection ─────────────────────────────────────────────────────

export function selectDraftCard(index, card, allCards) {
    const hand = document.getElementById('card-hand');
    const title = document.getElementById('hand-title');
    const cards = hand.querySelectorAll('.ninja-card');
    const round = gameState.draftRound;

    gameState.draftedCards.push(card);
    cards.forEach(c => c.style.pointerEvents = 'none');

    if (cards[index]) {
        cards[index].style.transition = 'all .4s ease';
        cards[index].style.transform = 'scale(1.08)';
        cards[index].style.border = '3px solid var(--success)';
    }

    setTimeout(() => {
        cards.forEach((el, i) => {
            if (i !== index) {
                el.style.transition = 'all .5s ease';
                el.style.transform = 'translateX(-200px) rotate(-10deg)';
                el.style.opacity = '0';
            }
        });

        const cname = getCardName(card);
        const actionMsg = round === 2
            ? `弃掉 ${allCards.length - 1} 张`
            : `传递 ${allCards.length - 1} 张给左边`;
        addLog(`保留「${cname}」，${actionMsg}`);
        updateDraftCollection();

        emit('select_draft_card', { room_code: gameState.roomCode, card_index: index });
        title.textContent = '等待其他玩家…';
    }, 300);
}

// ── Play a card (night phase) ────────────────────────────────────────────────

export function playCard(card) {
    if (gameState.phase !== 'night') return;

    const needsTarget = ['spy', 'mystic', 'assassin', 'shinobi'].includes(card.type)
        || (card.type === 'trickster' && ['troublemaker', 'soul_merchant', 'thief', 'judge'].includes(card.variant));
    const needsTwoTargets = card.type === 'trickster' && card.variant === 'shapeshifter';

    if (needsTwoTargets) {
        showTargetSelection(card, 2);
    } else if (needsTarget) {
        showTargetSelection(card, 1);
    } else {
        // No target needed (graverobber, special cards, etc.)
        emit('play_card', {
            room_code: gameState.roomCode,
            card_id: card.id,
        });
    }
}

// ── Target selection modal ───────────────────────────────────────────────────

function showTargetSelection(card, numTargets) {
    const modal = document.getElementById('target-modal');
    const title = document.getElementById('target-modal-title');
    const container = document.getElementById('target-list');

    const cname = getCardName(card);
    title.textContent = numTargets === 2
        ? `「${cname}」- 选择两名目标`
        : `「${cname}」- 选择目标`;

    container.innerHTML = '';
    _selectionQueue = [];

    const selfTargetCards = ['judge', 'thief'];
    const isSelfTarget = card.type === 'trickster' && selfTargetCards.includes(card.variant);

    (gameState.players || []).forEach(p => {
        if (!p.alive) return;
        if (p.sid === gameState.mySid && !isSelfTarget) return;

        const el = document.createElement('div');
        el.className = 'target-option';
        el.dataset.sid = p.sid;

        const info = gameState.revealedInfo[p.sid];
        let extra = '';
        if (info?.house) {
            const hi = HOUSE_INFO[info.house.house] || {};
            extra = ` <span style="color:${hi.color};font-size:.85em;">[${hi.name} ${info.house.number||''}]</span>`;
        }

        el.innerHTML = `<img src="/static/img/avatar_${p.avatar}.png" style="width:40px;height:40px;border-radius:50%;"><span>${p.name}${extra}</span>`;

        el.onclick = () => {
            if (numTargets === 2) {
                _handleDoubleTarget(p.sid, card, el);
            } else {
                emit('play_card', {
                    room_code: gameState.roomCode,
                    card_id: card.id,
                    target_sid: p.sid,
                });
                hideModal('target-modal');
            }
        };
        container.appendChild(el);
    });

    showModal('target-modal');
}

function _handleDoubleTarget(sid, card, el) {
    if (_selectionQueue.includes(sid)) {
        _selectionQueue = _selectionQueue.filter(s => s !== sid);
        el.style.border = '';
        return;
    }
    if (_selectionQueue.length >= 2) return;
    _selectionQueue.push(sid);
    el.style.border = '2px solid var(--accent)';

    if (_selectionQueue.length === 2) {
        setTimeout(() => {
            emit('play_card', {
                room_code: gameState.roomCode,
                card_id: card.id,
                target_sid: _selectionQueue[0],
                extra_data: { extra_target_sid: _selectionQueue[1] },
            });
            hideModal('target-modal');
            _selectionQueue = [];
        }, 200);
    }
}

// ── Handle prompt from server ────────────────────────────────────────────────

export function handlePrompt(promptData) {
    showPromptModal(promptData, (response) => {
        hidePromptModal();
        emit('prompt_response', {
            room_code: gameState.roomCode,
            response,
        });
    });
}

// ── Handle action_result (private info display) ──────────────────────────────

export function handleActionResult(data) {
    if (!data.success) {
        toast(data.message || '行动失败');
        return;
    }

    let html = `<p style="font-size:1.05em;margin-bottom:12px;">${data.message}</p>`;

    (data.effects || []).forEach(eff => {
        if (eff.type === 'reveal_house') {
            const hi = HOUSE_INFO[eff.house?.house] || {};
            html += `<div style="margin-top:12px;padding:12px;border:2px solid ${hi.color||'#555'};border-radius:8px;text-align:center;background:rgba(0,0,0,.3);">`;
            html += `<div style="font-size:.85em;color:var(--text-secondary);">揭示身份</div>`;
            html += `<div style="font-size:1.2em;font-weight:bold;color:${hi.color||'#fff'};margin-top:4px;">${eff.target_name}: ${hi.name||'?'} ${eff.house?.number||''}</div>`;
            html += `</div>`;

            // Store intelligence
            if (!gameState.revealedInfo[eff.target_sid]) gameState.revealedInfo[eff.target_sid] = {};
            gameState.revealedInfo[eff.target_sid].house = eff.house;

        } else if (eff.type === 'reveal_hand_card') {
            const cn = getCardName(eff.card);
            html += `<div style="margin-top:12px;padding:12px;border:1px solid #666;border-radius:8px;text-align:center;background:rgba(0,0,0,.3);">`;
            html += `<div style="font-size:.85em;color:var(--text-secondary);">揭示手牌</div>`;
            html += `<div style="font-size:1.1em;font-weight:bold;color:var(--accent);margin-top:4px;">${eff.target_name}: ${cn} #${eff.card?.number||'?'}</div>`;
            html += `</div>`;

        } else if (eff.type === 'reveal_scores') {
            html += `<div style="margin-top:12px;padding:12px;border:1px solid #666;border-radius:8px;text-align:center;background:rgba(0,0,0,.3);">`;
            html += `<div style="font-size:.85em;color:var(--text-secondary);">分数指示物</div>`;
            html += `<div style="font-size:1.1em;margin-top:4px;">${eff.target_name}: [${(eff.scores||[]).join(', ')}] = ${eff.total} 分</div>`;
            html += `</div>`;

        } else if (eff.type === 'card_gained') {
            const cn = getCardName(eff.card);
            html += `<div style="margin-top:8px;color:var(--success);">获得卡牌: ${cn}</div>`;
        }
    });

    if (html.includes('揭示') || html.includes('获得') || data.effects?.length) {
        showInfoModal('行动结果', html);
    }
}
