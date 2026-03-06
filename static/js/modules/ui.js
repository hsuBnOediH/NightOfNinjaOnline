// ── UI rendering helpers ─────────────────────────────────────────────────────

import { gameState } from './state.js';
import { CARD_INFO, HOUSE_INFO, getCardName, getCardDesc, getHouseName } from './constants.js';
import { t } from './i18n.js';

// ── Screen navigation ────────────────────────────────────────────────────────

export function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

// ── Waiting-room player list ─────────────────────────────────────────────────

export function updatePlayerList(players) {
    const list = document.getElementById('waiting-player-list');
    if (!list) return;
    list.innerHTML = '';
    players.forEach(p => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <img src="/static/img/avatar_${p.avatar}.png" alt="${p.name}">
            <div class="player-name">${p.name}</div>
        `;
        list.appendChild(card);
    });

    // Show host settings
    const sp = document.getElementById('host-settings');
    if (sp) {
        sp.style.display = 'block';
        const inp = document.getElementById('winning-threshold');
        if (inp) inp.disabled = !gameState.isHost;
    }
}

// ── Game player board (circular layout) ──────────────────────────────────────

export function updatePlayerBoard(players) {
    gameState.players = players;
    const board = document.getElementById('player-board');
    if (!board) return;
    board.innerHTML = '';

    const n = players.length;
    const step = (2 * Math.PI) / n;
    const radius = Math.min(250, Math.max(160, 40 * n));
    const cx = radius + 50, cy = radius + 50;
    board.style.width = `${(radius + 50) * 2}px`;
    board.style.height = `${(radius + 50) * 2}px`;

    players.forEach((p, i) => {
        const a = step * i - Math.PI / 2;
        const x = Math.cos(a) * radius + cx;
        const y = Math.sin(a) * radius + cy;

        const pos = document.createElement('div');
        pos.className = 'player-position';
        pos.dataset.sid = p.sid;
        pos.style.left = `${x}px`;
        pos.style.top = `${y}px`;
        pos.style.transform = 'translate(-50%,-50%)';

        if (p.sid === gameState.mySid) pos.classList.add('you');
        if (!p.alive) pos.classList.add('dead');
        if (!p.connected) pos.classList.add('disconnected');

        // House-color border if revealed
        if (p.house_revealed && p.house) {
            const hi = HOUSE_INFO[p.house.house];
            if (hi) pos.classList.add(p.house.house);
        }

        const avatar = document.createElement('img');
        avatar.className = 'player-avatar';
        avatar.src = `/static/img/avatar_${p.avatar}.png`;
        avatar.alt = p.name;

        const name = document.createElement('div');
        name.className = 'player-name';
        name.textContent = p.name;

        const status = document.createElement('div');
        status.className = 'player-status';
        if (!p.connected) {
            status.innerHTML = t('status_offline');
        } else if (!p.alive) {
            status.innerHTML = t('status_dead', p.score_count);
        } else {
            status.innerHTML = t('status_alive', p.hand_count, p.score_count);
        }

        pos.appendChild(avatar);
        pos.appendChild(name);
        pos.appendChild(status);

        // Revealed info badge
        const info = gameState.revealedInfo[p.sid];
        if (info && info.house) {
            const hi = HOUSE_INFO[info.house.house];
            if (hi) {
                const badge = document.createElement('div');
                badge.className = 'revealed-badge';
                badge.style.background = hi.color;
                badge.innerHTML = `<img src="/static/img/${info.house.house}.png" style="width:16px;height:16px;margin-right:3px;vertical-align:middle;">${info.house.number || ''}`;
                pos.appendChild(badge);
            }
        }

        // Public house reveal (from server state)
        if (p.house_revealed && p.house && !info?.house) {
            const hi = HOUSE_INFO[p.house.house];
            if (hi) {
                const badge = document.createElement('div');
                badge.className = 'revealed-badge';
                badge.style.background = hi.color;
                badge.innerHTML = `<img src="/static/img/${p.house.house}.png" style="width:16px;height:16px;margin-right:3px;vertical-align:middle;">${p.house.number || ''}`;
                pos.appendChild(badge);
            }
        }

        board.appendChild(pos);
    });
}

// ── Card element ─────────────────────────────────────────────────────────────

export function createCardElement(card, enabled = false) {
    const el = document.createElement('div');
    el.className = 'ninja-card';
    el.dataset.cardId = card.id || '';
    if (!enabled) el.classList.add('disabled');

    // Rank badge
    if (card.rank) {
        const rb = document.createElement('div');
        rb.className = 'card-rank';
        rb.textContent = card.rank;
        el.appendChild(rb);

        if (card.number) {
            const nb = document.createElement('div');
            nb.className = 'card-number-badge';
            nb.textContent = `#${card.number}`;
            el.appendChild(nb);
        }
    } else {
        // Special card marker
        const sp = document.createElement('div');
        sp.className = 'card-rank special';
        sp.textContent = '!';
        if (card.type === 'mastermind') sp.textContent = '👁';
        el.appendChild(sp);
    }

    // Image
    const img = document.createElement('img');
    img.className = 'card-image';
    img.src = `/static/img/${card.type === 'trickster' ? 'trickster' : card.type}.png`;
    img.onerror = () => { img.style.display = 'none'; };
    el.appendChild(img);

    // Name
    const nm = document.createElement('div');
    nm.className = 'card-name';
    nm.textContent = getCardName(card);
    el.appendChild(nm);

    // Description
    const dc = document.createElement('div');
    dc.className = 'card-description';
    dc.textContent = getCardDesc(card);
    el.appendChild(dc);

    return el;
}

// ── Draft collection panel ───────────────────────────────────────────────────

export function updateDraftCollection() {
    const col = document.getElementById('draft-collection');
    if (!col) return;
    col.innerHTML = '';
    if (!gameState.draftedCards.length) {
        col.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:20px;font-size:.9em;">${t('select_cards_placeholder').replace('\n', '<br>')}</p>`;
        return;
    }
    gameState.draftedCards.forEach(c => {
        const el = createCardElement(c, false);
        el.style.width = '110px';
        el.style.height = '155px';
        col.appendChild(el);
    });
}

// ── Prompt modal ─────────────────────────────────────────────────────────────

export function showPromptModal(promptData, onResponse) {
    const modal = document.getElementById('prompt-modal');
    const title = document.getElementById('prompt-title');
    const body = document.getElementById('prompt-body');
    if (!modal || !title || !body) return;

    body.innerHTML = '';
    const pt = promptData.type;
    const d = promptData.data || {};

    if (pt === 'kill_reaction') {
        title.textContent = t('attacked_title');
        const opts = d.options || [];
        const desc = document.createElement('p');
        const attackName = d.attack_type === 'assassin' ? t('attack_assassin') : t('attack_shinobi');
        desc.textContent = t('attacked_by', d.attacker_name, attackName);
        desc.style.marginBottom = '16px';
        body.appendChild(desc);
        _addPromptButtons(body, [
            ...(opts.includes('mirror_monk') ? [{ label: t('use_mirror_monk'), value: { reaction: 'mirror_monk' } }] : []),
            ...(opts.includes('martyr') ? [{ label: t('use_martyr'), value: { reaction: 'martyr' } }] : []),
            { label: t('accept_death'), value: { reaction: 'none' }, secondary: true },
        ], onResponse);

    } else if (pt === 'shinobi_decision') {
        title.textContent = t('shinobi_decision');
        const info = HOUSE_INFO[d.target_house?.house] || {};
        const houseName = getHouseName(d.target_house?.house);
        body.innerHTML = `<p style="margin-bottom:16px;">${t('target_identity', `<strong>${d.target_name}</strong>`, `<span style="color:${info.color || '#fff'};font-weight:bold;">${houseName}`, `${d.target_house?.number || ''}</span>`)}</p>`;
        _addPromptButtons(body, [
            { label: t('kill_btn'), value: { kill: true } },
            { label: t('spare_btn'), value: { kill: false }, secondary: true },
        ], onResponse);

    } else if (pt === 'graverobber_pick') {
        title.textContent = t('graverobber_title');
        const cards = d.cards || [];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin:16px 0;';
        cards.forEach(c => {
            const cel = createCardElement(c, true);
            cel.style.cursor = 'pointer';
            cel.onclick = () => { onResponse({ card_id: c.id }); };
            row.appendChild(cel);
        });
        body.appendChild(row);

    } else if (pt === 'troublemaker_reveal') {
        title.textContent = t('troublemaker_title');
        const info = HOUSE_INFO[d.target_house?.house] || {};
        const houseName = getHouseName(d.target_house?.house);
        body.innerHTML = `<p style="margin-bottom:16px;">${t('troublemaker_identity', `<strong>${d.target_name}</strong>`, `<span style="color:${info.color || '#fff'};font-weight:bold;">${houseName}`, `${d.target_house?.number || ''}</span>`)}</p><p>${t('troublemaker_reveal_q')}</p>`;
        _addPromptButtons(body, [
            { label: t('reveal_public'), value: { reveal: true } },
            { label: t('keep_secret'), value: { reveal: false }, secondary: true },
        ], onResponse);

    } else if (pt === 'soul_merchant_choice') {
        title.textContent = t('soul_merchant_title');
        body.innerHTML = `<p style="margin-bottom:16px;">${t('soul_merchant_choose', `<strong>${d.target_name}</strong>`)}</p>`;
        _addPromptButtons(body, [
            { label: t('view_house'), value: { choice: 'house' } },
            { label: t('view_scores'), value: { choice: 'scores' } },
        ], onResponse);

    } else if (pt === 'soul_merchant_swap') {
        title.textContent = t('soul_merchant_swap_title');
        body.innerHTML = `<p style="margin-bottom:16px;">${t('soul_merchant_swap_q', `<strong>${d.target_name}</strong>`)}</p>`;
        _addPromptButtons(body, [
            { label: t('swap_btn'), value: { swap: true } },
            { label: t('no_swap_btn'), value: { swap: false }, secondary: true },
        ], onResponse);

    } else if (pt === 'shapeshifter_swap') {
        title.textContent = t('shapeshifter_title');
        body.innerHTML = `<p style="margin-bottom:16px;">${t('shapeshifter_swap_q', `<strong>${d.target1_name}</strong>`, `<strong>${d.target2_name}</strong>`)}</p>`;
        _addPromptButtons(body, [
            { label: t('swap_identity_btn'), value: { swap: true } },
            { label: t('no_swap_identity_btn'), value: { swap: false }, secondary: true },
        ], onResponse);

    } else {
        title.textContent = t('prompt_unknown');
        body.innerHTML = `<p>${t('prompt_unknown_type', pt)}</p>`;
        _addPromptButtons(body, [
            { label: t('ok'), value: {}, secondary: true },
        ], onResponse);
    }

    modal.classList.add('active');
    modal.style.display = 'flex';
}

export function hidePromptModal() {
    const m = document.getElementById('prompt-modal');
    if (m) { m.classList.remove('active'); m.style.display = ''; }
}

function _addPromptButtons(container, buttons, onResponse) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:20px;';
    buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.className = b.secondary ? 'btn btn-secondary' : 'btn btn-primary';
        btn.textContent = b.label;
        btn.onclick = () => onResponse(b.value);
        row.appendChild(btn);
    });
    container.appendChild(row);
}

// ── Round-complete results modal ─────────────────────────────────────────────

export function showRoundResults(data) {
    let html = '';
    if (data.winning_house) {
        const houseName = getHouseName(data.winning_house);
        const hi = HOUSE_INFO[data.winning_house] || {};
        html += `<div style="text-align:center;margin-bottom:16px;"><span style="color:${hi.color || '#fff'};font-size:1.4em;font-weight:bold;">${t('house_won', houseName)}</span></div>`;
    } else if (data.ronin_winners?.length) {
        html += `<div style="text-align:center;margin-bottom:16px;"><span style="color:var(--ronin-color);font-size:1.4em;font-weight:bold;">${t('ronin_won')}</span></div>`;
    } else {
        html += `<div style="text-align:center;margin-bottom:16px;color:var(--text-secondary);">${t('round_tie')}</div>`;
    }

    html += '<table style="width:100%;border-collapse:collapse;margin-top:12px;">';
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.1);"><th style="text-align:left;padding:6px;">${t('player_col')}</th><th>${t('identity_col')}</th><th>${t('status_col')}</th><th>${t('total_score_col')}</th></tr>`;
    (data.scores || []).forEach(s => {
        const houseName = s.house ? getHouseName(s.house.house) : '?';
        const hi = HOUSE_INFO[s.house?.house] || {};
        const isMe = s.sid === gameState.mySid;
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);${isMe ? 'background:rgba(255,255,255,0.05);' : ''}">`;
        html += `<td style="padding:6px;">${isMe ? '⭐ ' : ''}${s.name}</td>`;
        html += `<td style="text-align:center;color:${hi.color || '#aaa'};">${houseName} ${s.house?.number || ''}</td>`;
        html += `<td style="text-align:center;">${s.alive ? '✅' : '💀'}</td>`;
        html += `<td style="text-align:center;font-weight:bold;">${s.total_score}</td>`;
        html += '</tr>';
    });
    html += '</table>';

    // Your tokens
    if (data.your_score_tokens) {
        html += `<div style="margin-top:16px;text-align:center;color:var(--accent);">${t('your_score_tokens', data.your_score_tokens.join(', '), data.your_total)}</div>`;
    }

    // Next round button for host
    if (gameState.isHost) {
        html += `<div style="text-align:center;margin-top:20px;"><button class="btn btn-primary" id="next-round-btn">${t('next_round')}</button></div>`;
    } else {
        html += `<div style="text-align:center;margin-top:20px;color:var(--text-secondary);">${t('waiting_host_next')}</div>`;
    }

    const { showInfoModal } = await_utils();
    showInfoModal(t('round_scoring'), html);

    // Wire up next-round button
    setTimeout(() => {
        const btn = document.getElementById('next-round-btn');
        if (btn) {
            btn.onclick = () => {
                const { emit } = _getEmit();
                emit('next_round', { room_code: gameState.roomCode });
                btn.disabled = true;
                btn.textContent = t('waiting');
            };
        }
    }, 100);
}

// These are set by main.js to avoid circular imports
let _emitFn = null;
let _utilsMod = null;
export function setEmitFn(fn) { _emitFn = fn; }
export function setUtilsModule(mod) { _utilsMod = mod; }
function _getEmit() { return { emit: _emitFn }; }
function await_utils() { return _utilsMod; }
