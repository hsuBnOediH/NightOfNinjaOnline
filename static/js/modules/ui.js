// ── UI rendering helpers ─────────────────────────────────────────────────────

import { gameState } from './state.js';
import { CARD_INFO, HOUSE_INFO, getCardName, getCardDesc } from './constants.js';

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
            status.innerHTML = '📡 掉线';
        } else if (!p.alive) {
            status.innerHTML = `💀 已死亡 | 🏅${p.score_count}`;
        } else {
            status.innerHTML = `❤️ 存活 | 🎴${p.hand_count} | 🏅${p.score_count}`;
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
        col.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;font-size:.9em;">选择卡牌后<br>显示在此处</p>';
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
    const body  = document.getElementById('prompt-body');
    if (!modal || !title || !body) return;

    body.innerHTML = '';
    const pt = promptData.type;
    const d  = promptData.data || {};

    if (pt === 'kill_reaction') {
        title.textContent = '⚔️ 你被攻击了！';
        const opts = d.options || [];
        const desc = document.createElement('p');
        desc.textContent = `${d.attacker_name} 对你使用了${d.attack_type === 'assassin' ? '盲眼刺客' : '上忍'}！`;
        desc.style.marginBottom = '16px';
        body.appendChild(desc);
        _addPromptButtons(body, [
            ...(opts.includes('mirror_monk') ? [{ label: '🪞 使用经施僧（反杀）', value: { reaction: 'mirror_monk' } }] : []),
            ...(opts.includes('martyr')      ? [{ label: '🕊️ 使用殉道者（获得分数）', value: { reaction: 'martyr' } }] : []),
            { label: '😵 接受死亡', value: { reaction: 'none' }, secondary: true },
        ], onResponse);

    } else if (pt === 'shinobi_decision') {
        title.textContent = '🗡️ 上忍决定';
        const info = HOUSE_INFO[d.target_house?.house] || {};
        body.innerHTML = `<p style="margin-bottom:16px;">目标 <strong>${d.target_name}</strong> 的身份是 <span style="color:${info.color||'#fff'};font-weight:bold;">${info.name||'???'} ${d.target_house?.number||''}</span></p>`;
        _addPromptButtons(body, [
            { label: '⚔️ 击杀', value: { kill: true } },
            { label: '🕊️ 放过', value: { kill: false }, secondary: true },
        ], onResponse);

    } else if (pt === 'graverobber_pick') {
        title.textContent = '🪦 掘墓人 - 选择一张卡牌';
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
        title.textContent = '🎭 捣蛋鬼';
        const info = HOUSE_INFO[d.target_house?.house] || {};
        body.innerHTML = `<p style="margin-bottom:16px;"><strong>${d.target_name}</strong> 的身份是 <span style="color:${info.color||'#fff'};font-weight:bold;">${info.name||'???'} ${d.target_house?.number||''}</span></p><p>是否公开揭示给所有人？</p>`;
        _addPromptButtons(body, [
            { label: '📢 公开揭示', value: { reveal: true } },
            { label: '🤫 不揭示', value: { reveal: false }, secondary: true },
        ], onResponse);

    } else if (pt === 'soul_merchant_choice') {
        title.textContent = '👻 灵魂商贩';
        body.innerHTML = `<p style="margin-bottom:16px;">选择查看 <strong>${d.target_name}</strong> 的：</p>`;
        _addPromptButtons(body, [
            { label: '🏠 流派身份', value: { choice: 'house' } },
            { label: '🏅 分数指示物', value: { choice: 'scores' } },
        ], onResponse);

    } else if (pt === 'soul_merchant_swap') {
        title.textContent = '👻 灵魂商贩 - 交换分数';
        body.innerHTML = `<p style="margin-bottom:16px;">是否与 <strong>${d.target_name}</strong> 交换一枚分数指示物？</p>`;
        _addPromptButtons(body, [
            { label: '🔄 交换', value: { swap: true } },
            { label: '❌ 不交换', value: { swap: false }, secondary: true },
        ], onResponse);

    } else if (pt === 'shapeshifter_swap') {
        title.textContent = '🎭 百变者 - 互换身份';
        body.innerHTML = `<p style="margin-bottom:16px;">是否互换 <strong>${d.target1_name}</strong> 和 <strong>${d.target2_name}</strong> 的身份？</p>`;
        _addPromptButtons(body, [
            { label: '🔄 互换', value: { swap: true } },
            { label: '❌ 不互换', value: { swap: false }, secondary: true },
        ], onResponse);

    } else {
        title.textContent = '提示';
        body.innerHTML = `<p>未知提示类型: ${pt}</p>`;
        _addPromptButtons(body, [
            { label: '确定', value: {}, secondary: true },
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
        const hi = HOUSE_INFO[data.winning_house] || {};
        html += `<div style="text-align:center;margin-bottom:16px;"><span style="color:${hi.color||'#fff'};font-size:1.4em;font-weight:bold;">${hi.name||data.winning_house} 获胜！</span></div>`;
    } else if (data.ronin_winners?.length) {
        html += `<div style="text-align:center;margin-bottom:16px;"><span style="color:var(--ronin-color);font-size:1.4em;font-weight:bold;">浪人独自取胜！</span></div>`;
    } else {
        html += `<div style="text-align:center;margin-bottom:16px;color:var(--text-secondary);">本轮平局</div>`;
    }

    html += '<table style="width:100%;border-collapse:collapse;margin-top:12px;">';
    html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.1);"><th style="text-align:left;padding:6px;">玩家</th><th>身份</th><th>状态</th><th>总分</th></tr>';
    (data.scores || []).forEach(s => {
        const hi = HOUSE_INFO[s.house?.house] || {};
        const isMe = s.sid === gameState.mySid;
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);${isMe ? 'background:rgba(255,255,255,0.05);' : ''}">`;
        html += `<td style="padding:6px;">${isMe ? '⭐ ' : ''}${s.name}</td>`;
        html += `<td style="text-align:center;color:${hi.color||'#aaa'};">${hi.name||'?'} ${s.house?.number||''}</td>`;
        html += `<td style="text-align:center;">${s.alive ? '✅' : '💀'}</td>`;
        html += `<td style="text-align:center;font-weight:bold;">${s.total_score}</td>`;
        html += '</tr>';
    });
    html += '</table>';

    // Your tokens
    if (data.your_score_tokens) {
        html += `<div style="margin-top:16px;text-align:center;color:var(--accent);">你的分数指示物: [${data.your_score_tokens.join(', ')}] = ${data.your_total} 分</div>`;
    }

    // Next round button for host
    if (gameState.isHost) {
        html += `<div style="text-align:center;margin-top:20px;"><button class="btn btn-primary" id="next-round-btn">下一回合</button></div>`;
    } else {
        html += `<div style="text-align:center;margin-top:20px;color:var(--text-secondary);">等待房主开始下一回合…</div>`;
    }

    const { showInfoModal } = await_utils();
    showInfoModal('回合结算', html);

    // Wire up next-round button
    setTimeout(() => {
        const btn = document.getElementById('next-round-btn');
        if (btn) {
            btn.onclick = () => {
                const { emit } = _getEmit();
                emit('next_round', { room_code: gameState.roomCode });
                btn.disabled = true;
                btn.textContent = '等待中…';
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
