// ── Tutorial module ─────────────────────────────────────────────────────────
// Step-by-step overlay tutorial for new players. Supports zh/en via i18n.

import { t, getLang } from './i18n.js';

const TUTORIAL_SEEN_KEY = 'ninja_tutorial_seen';

const steps = {
    zh: [
        {
            icon: '🏮',
            title: '欢迎来到忍者之夜！',
            content: `
                <p>这是一款<strong>社交推理卡牌对战游戏</strong>，每局 3-11 人。</p>
                <p>玩家被秘密分为两个敌对流派：</p>
                <div class="tutorial-houses">
                    <div class="tutorial-house lotus">🪷 莲花（蓝）</div>
                    <div class="tutorial-house crane">🦢 仙鹤（红）</div>
                    <div class="tutorial-house ronin">🗡️ 浪人（紫）<small>奇数人局</small></div>
                </div>
                <p>找出敌方的人，保护己方<strong>等级最高</strong>的成员活到最后！</p>
            `
        },
        {
            icon: '🔄',
            title: '每回合流程',
            content: `
                <div class="tutorial-flow">
                    <div class="tutorial-step-item">
                        <span class="step-num">1</span>
                        <div><strong>查看身份</strong><br>收到秘密流派卡（等级 1 最高，5 最低）</div>
                    </div>
                    <div class="tutorial-step-item">
                        <span class="step-num">2</span>
                        <div><strong>轮抽卡牌</strong><br>发 3 张忍者卡 → 保留 1 张传 2 张 → 再保留 1 张 → 最终手持 2 张</div>
                    </div>
                    <div class="tutorial-step-item">
                        <span class="step-num">3</span>
                        <div><strong>夜晚行动</strong><br>按阶段顺序打出卡牌：密探→隐士→骗徒→刺客→上忍</div>
                    </div>
                    <div class="tutorial-step-item">
                        <span class="step-num">4</span>
                        <div><strong>揭示结算</strong><br>存活玩家翻开身份，最高等级存活的流派获胜</div>
                    </div>
                    <div class="tutorial-step-item">
                        <span class="step-num">5</span>
                        <div><strong>计分</strong><br>获胜方全员抽分数指示物，先到 10 分赢！</div>
                    </div>
                </div>
            `
        },
        {
            icon: '🎴',
            title: '卡牌类型',
            content: `
                <div class="tutorial-cards-grid">
                    <div class="tutorial-card-item spy">
                        <div class="card-icon">🔍</div>
                        <strong>密探 Spy</strong>
                        <small>查看一名玩家的身份</small>
                    </div>
                    <div class="tutorial-card-item mystic">
                        <div class="card-icon">👁️</div>
                        <strong>隐士 Mystic</strong>
                        <small>查看身份 + 一张手牌</small>
                    </div>
                    <div class="tutorial-card-item trickster">
                        <div class="card-icon">🎭</div>
                        <strong>骗徒 Trickster</strong>
                        <small>6 种特殊能力（互换身份、抢分等）</small>
                    </div>
                    <div class="tutorial-card-item assassin">
                        <div class="card-icon">🗡️</div>
                        <strong>盲眼刺客</strong>
                        <small>直接击杀一名玩家</small>
                    </div>
                    <div class="tutorial-card-item shinobi">
                        <div class="card-icon">⚔️</div>
                        <strong>上忍 Shinobi</strong>
                        <small>先看身份，再决定是否击杀</small>
                    </div>
                </div>
                <p style="margin-top:12px; font-size:0.9em; color:var(--text-secondary);">
                    💡 还有 <strong>殉道者</strong>（死亡得分）、<strong>经施僧</strong>（反杀）、<strong>首脑</strong>（强制胜利）等特殊卡！
                </p>
            `
        },
        {
            icon: '💡',
            title: '核心策略',
            content: `
                <div class="tutorial-tips">
                    <div class="tutorial-tip">
                        <span class="tip-icon">🧠</span>
                        <div>
                            <strong>知识就是力量</strong>
                            <p>前期用密探和隐士摸清敌友，后期精准出刀。</p>
                        </div>
                    </div>
                    <div class="tutorial-tip">
                        <span class="tip-icon">🛡️</span>
                        <div>
                            <strong>弃车保帅</strong>
                            <p>低等级队员保护高等级大哥——流派赢了你也拿分！</p>
                        </div>
                    </div>
                    <div class="tutorial-tip">
                        <span class="tip-icon">🎭</span>
                        <div>
                            <strong>真理与谎言</strong>
                            <p>大声虚张声势！用嘴炮迷惑对手也是重要策略。</p>
                        </div>
                    </div>
                    <div class="tutorial-tip">
                        <span class="tip-icon">⏳</span>
                        <div>
                            <strong>时机选择</strong>
                            <p>可以选择不出牌（跳过），但过了阶段的卡本回合作废。</p>
                        </div>
                    </div>
                </div>
                <p style="text-align:center; margin-top:16px; font-size:1.1em; font-weight:700; color:var(--accent);">
                    准备好了吗？创建房间邀请好友开战！🎉
                </p>
            `
        },
    ],
    en: [
        {
            icon: '🏮',
            title: 'Welcome to Night of Ninja!',
            content: `
                <p>A <strong>social deduction card game</strong> for 3-11 players.</p>
                <p>Players are secretly divided into two rival houses:</p>
                <div class="tutorial-houses">
                    <div class="tutorial-house lotus">🪷 Lotus (Blue)</div>
                    <div class="tutorial-house crane">🦢 Crane (Red)</div>
                    <div class="tutorial-house ronin">🗡️ Ronin (Purple)<small>odd player count</small></div>
                </div>
                <p>Find your enemies and keep your house's <strong>highest-ranked</strong> member alive!</p>
            `
        },
        {
            icon: '🔄',
            title: 'Round Flow',
            content: `
                <div class="tutorial-flow">
                    <div class="tutorial-step-item">
                        <span class="step-num">1</span>
                        <div><strong>Identity</strong><br>Receive a secret house card (Tier 1 = highest)</div>
                    </div>
                    <div class="tutorial-step-item">
                        <span class="step-num">2</span>
                        <div><strong>Draft</strong><br>Get 3 ninja cards → keep 1, pass 2 → keep 1 more → end with 2 cards</div>
                    </div>
                    <div class="tutorial-step-item">
                        <span class="step-num">3</span>
                        <div><strong>Night Phase</strong><br>Play cards in order: Spy → Mystic → Trickster → Assassin → Shinobi</div>
                    </div>
                    <div class="tutorial-step-item">
                        <span class="step-num">4</span>
                        <div><strong>Reveal</strong><br>Survivors reveal identity. House with highest-ranked survivor wins!</div>
                    </div>
                    <div class="tutorial-step-item">
                        <span class="step-num">5</span>
                        <div><strong>Scoring</strong><br>Winning house draws score tokens. First to 10 points wins the game!</div>
                    </div>
                </div>
            `
        },
        {
            icon: '🎴',
            title: 'Card Types',
            content: `
                <div class="tutorial-cards-grid">
                    <div class="tutorial-card-item spy">
                        <div class="card-icon">🔍</div>
                        <strong>Spy</strong>
                        <small>View one player's identity</small>
                    </div>
                    <div class="tutorial-card-item mystic">
                        <div class="card-icon">👁️</div>
                        <strong>Mystic</strong>
                        <small>View identity + one hand card</small>
                    </div>
                    <div class="tutorial-card-item trickster">
                        <div class="card-icon">🎭</div>
                        <strong>Trickster</strong>
                        <small>6 unique abilities (swap, steal, etc.)</small>
                    </div>
                    <div class="tutorial-card-item assassin">
                        <div class="card-icon">🗡️</div>
                        <strong>Blind Assassin</strong>
                        <small>Kill a player directly</small>
                    </div>
                    <div class="tutorial-card-item shinobi">
                        <div class="card-icon">⚔️</div>
                        <strong>Shinobi</strong>
                        <small>View identity, then choose to kill</small>
                    </div>
                </div>
                <p style="margin-top:12px; font-size:0.9em; color:var(--text-secondary);">
                    💡 Plus special cards: <strong>Martyr</strong> (score on death), <strong>Mirror Monk</strong> (reflect kill), <strong>Mastermind</strong> (auto-win)!
                </p>
            `
        },
        {
            icon: '💡',
            title: 'Core Strategy',
            content: `
                <div class="tutorial-tips">
                    <div class="tutorial-tip">
                        <span class="tip-icon">🧠</span>
                        <div>
                            <strong>Knowledge is Power</strong>
                            <p>Use Spy and Mystic early to identify friends and foes.</p>
                        </div>
                    </div>
                    <div class="tutorial-tip">
                        <span class="tip-icon">🛡️</span>
                        <div>
                            <strong>Sacrifice for Victory</strong>
                            <p>Low-rank members protect the boss — your whole house scores!</p>
                        </div>
                    </div>
                    <div class="tutorial-tip">
                        <span class="tip-icon">🎭</span>
                        <div>
                            <strong>Bluff & Deceive</strong>
                            <p>Trash talk and misdirection are powerful weapons.</p>
                        </div>
                    </div>
                    <div class="tutorial-tip">
                        <span class="tip-icon">⏳</span>
                        <div>
                            <strong>Timing Matters</strong>
                            <p>You can skip a card, but once a phase passes, unused cards are wasted.</p>
                        </div>
                    </div>
                </div>
                <p style="text-align:center; margin-top:16px; font-size:1.1em; font-weight:700; color:var(--accent);">
                    Ready? Create a room and invite your friends! 🎉
                </p>
            `
        },
    ],
};

let currentStep = 0;
let overlay = null;

function getSteps() {
    const lang = getLang();
    return steps[lang] || steps.zh;
}

function renderStep() {
    const s = getSteps();
    const step = s[currentStep];
    const total = s.length;

    const dots = s.map((_, i) =>
        `<span class="tutorial-dot ${i === currentStep ? 'active' : ''}" data-step="${i}"></span>`
    ).join('');

    overlay.querySelector('.tutorial-body').innerHTML = `
        <div class="tutorial-step-content" key="${currentStep}">
            <div class="tutorial-icon">${step.icon}</div>
            <h2 class="tutorial-step-title">${step.title}</h2>
            <div class="tutorial-step-body">${step.content}</div>
        </div>
    `;

    overlay.querySelector('.tutorial-dots').innerHTML = dots;

    // Update button states
    const prevBtn = overlay.querySelector('.tutorial-prev');
    const nextBtn = overlay.querySelector('.tutorial-next');
    prevBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = currentStep === total - 1 ? (getLang() === 'zh' ? '开始游戏！' : 'Let\'s Play!') : (getLang() === 'zh' ? '下一步 →' : 'Next →');

    // Counter
    overlay.querySelector('.tutorial-counter').textContent = `${currentStep + 1} / ${total}`;

    // Dot click handlers
    overlay.querySelectorAll('.tutorial-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            currentStep = parseInt(dot.dataset.step);
            renderStep();
        });
    });
}

export function openTutorial() {
    currentStep = 0;

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        overlay.className = 'tutorial-overlay';
        overlay.innerHTML = `
            <div class="tutorial-container glass-panel">
                <button class="tutorial-close" id="tutorial-close-btn">&times;</button>
                <div class="tutorial-body"></div>
                <div class="tutorial-footer">
                    <button class="btn btn-secondary tutorial-prev">← ${getLang() === 'zh' ? '上一步' : 'Back'}</button>
                    <div class="tutorial-dots"></div>
                    <button class="btn btn-primary tutorial-next">${getLang() === 'zh' ? '下一步 →' : 'Next →'}</button>
                </div>
                <div class="tutorial-counter"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Event listeners
        overlay.querySelector('.tutorial-close').addEventListener('click', closeTutorial);
        overlay.querySelector('.tutorial-prev').addEventListener('click', () => {
            if (currentStep > 0) { currentStep--; renderStep(); }
        });
        overlay.querySelector('.tutorial-next').addEventListener('click', () => {
            const s = getSteps();
            if (currentStep < s.length - 1) { currentStep++; renderStep(); }
            else closeTutorial();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeTutorial();
        });
    }

    overlay.classList.add('active');
    renderStep();
}

export function closeTutorial() {
    if (overlay) overlay.classList.remove('active');
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
}

export function initTutorial() {
    // Auto-open on first visit
    if (!localStorage.getItem(TUTORIAL_SEEN_KEY)) {
        setTimeout(() => openTutorial(), 800);
    }
}
