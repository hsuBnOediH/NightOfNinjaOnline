// ── Utility helpers ──────────────────────────────────────────────────────────

import { t } from './i18n.js';

export function addLog(message) {
    const log = document.getElementById('game-log');
    if (!log) return;
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    log.insertBefore(el, log.firstChild);
    while (log.children.length > 50) log.removeChild(log.lastChild);
}

export function updateStageGuidance(title, desc) {
    const t = document.getElementById('stage-title');
    const d = document.getElementById('stage-description');
    if (t) t.textContent = title;
    if (d) d.textContent = desc;
}

export function showModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add('active'); el.style.display = 'flex'; }
}

export function hideModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('active'); el.style.display = ''; }
}

export function showInfoModal(title, html) {
    const t = document.getElementById('info-title');
    const c = document.getElementById('info-content');
    if (t) t.textContent = title;
    if (c) c.innerHTML = html;
    showModal('info-modal');
}

export function showConfirm(message, title, onOk, onCancel) {
    document.getElementById('confirm-title').textContent = title || t('confirm');
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-ok-btn').onclick = () => { hideModal('confirm-modal'); if (onOk) onOk(); };
    document.getElementById('confirm-cancel-btn').onclick = () => { hideModal('confirm-modal'); if (onCancel) onCancel(); };
    showModal('confirm-modal');
}

export function getRankName(rank) {
    return {
        1: t('rank_1'),
        2: t('rank_2'),
        3: t('rank_3'),
        4: t('rank_4'),
        5: t('rank_5'),
    }[rank] || t('rank_phase_fallback', rank);
}

export function toast(msg, duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = 'toast-msg';
    el.textContent = msg;
    el.style.cssText = 'background:rgba(0,0,0,0.85);color:#fff;padding:12px 20px;border-radius:8px;font-size:0.95rem;border-left:4px solid var(--accent,#e05);animation:fadeIn .3s ease;max-width:360px;';
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, duration);
}
