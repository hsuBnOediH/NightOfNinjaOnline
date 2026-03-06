// ── Internationalization (i18n) module ────────────────────────────────────────
// Supports zh (Chinese) and en (English). Language is persisted in localStorage.

const translations = {
    zh: {
        // ── Page title ───────────────────────────────────────────────────
        page_title: '忍者之夜 Online',

        // ── Lobby ────────────────────────────────────────────────────────
        game_title: '忍者之夜',
        game_subtitle: 'Night of Ninja Online',
        player_name_label: '玩家名称',
        player_name_placeholder: '输入你的名字',
        select_avatar: '选择头像',
        create_room: '创建房间',
        or_divider: '或',
        room_code_placeholder: '房间代码',
        join_room: '加入房间',

        // ── Waiting room ─────────────────────────────────────────────────
        room_code_label: '房间代码',
        copy_btn: '复制',
        leave_room: '离开房间',
        waiting_players: '等待玩家中...',
        room_settings: '房间设置',
        winning_threshold_label: '胜利所需勋章分',
        start_game: '开始游戏',

        // ── Game header ──────────────────────────────────────────────────
        preparing: '游戏准备中...',
        waiting_start: '等待游戏开始',
        round_label: '回合',
        phase_label: '阶段',
        win_target: '胜利目标:',
        my_honor_total: '我的荣誉分:',
        my_honor_count: '我的徽章:',

        // ── Player info ──────────────────────────────────────────────────
        your_house: '你的家族:',

        // ── Draft ────────────────────────────────────────────────────────
        saved_cards: '已保留卡牌',
        your_hand: '你的手牌',
        select_cards_placeholder: '选择卡牌后\n显示在此处',

        // ── Game log ─────────────────────────────────────────────────────
        game_log: '游戏记录',

        // ── Modals ───────────────────────────────────────────────────────
        select_target: '选择目标',
        cancel: '取消',
        info: '信息',
        ok: '确定',
        confirm: '确认',

        // ── Prompt modal ─────────────────────────────────────────────────
        decision: '决定',

        // ── Dynamic strings ──────────────────────────────────────────────
        room_code_copied: '房间代码已复制',
        enter_name: '请输入你的名字',
        enter_room_code: '请输入4位房间代码',
        error_generic: '错误',
        player_joined_room: '{0} 加入了房间',
        player_left_room: '{0} 离开了房间',
        player_disconnected: '{0} 掉线了',
        player_disconnected_short: '{0} 掉线',
        player_reconnected: '{0} 重新连接',
        player_reconnected_short: '{0} 重连',
        room_closed: '房间已关闭',
        reconnect_success: '重新连接成功',

        // ── Game phases ──────────────────────────────────────────────────
        house_assignment: '流派分配',
        house_assigned_desc: '你已收到流派卡，等待轮抽开始',
        game_started_log: '游戏开始！查看你的流派卡',
        house_tier: '等级 {0}',

        // ── Draft phase ──────────────────────────────────────────────────
        draft_phase: '轮抽阶段 {0}/2',
        draft_received: '收到 {0} 张卡牌，选择 1 张保留',
        draft_round_log: '轮抽第 {0} 轮：{1} 张卡牌',
        waiting_others_select: '等待其他玩家选择…',
        draft_select_prompt: '第 {0}/2 轮：选择 1 张保留',
        draft_discard: '弃掉 {0} 张',
        draft_pass: '传递 {0} 张给左边',
        draft_kept: '保留「{0}」，{1}',
        waiting_others: '等待其他玩家…',

        // ── Night phase ──────────────────────────────────────────────────
        night_phase: '夜晚阶段 - {0}',
        waiting_action: '等待行动…',
        night_started: '夜晚阶段开始！',
        your_turn: '轮到你了！',
        skip: '跳过',
        confirm_skip: '确认跳过？卡牌将保留在手中（本阶段不可再使用）。',
        skip_turn: '跳过回合',
        you_died: '你已死亡，等待回合结束…',
        waiting_others_action: '等待其他玩家行动…',
        rank_phase: '—— {0} 阶段 ——',
        player_skipped: '玩家跳过',
        action_failed: '行动失败',

        // ── Scoring ──────────────────────────────────────────────────────
        round_scoring: '回合结算',
        view_results: '查看本轮结果',
        house_won: '{0} 获胜！',
        ronin_won: '浪人独自取胜！',
        round_tie: '本轮平局',
        player_col: '玩家',
        identity_col: '身份',
        status_col: '状态',
        total_score_col: '总分',
        your_score_tokens: '你的分数指示物: [{0}] = {1} 分',
        next_round: '下一回合',
        waiting_host_next: '等待房主开始下一回合…',
        waiting: '等待中…',
        new_round: '新回合',
        waiting_draft: '等待轮抽开始',
        round_number: '—— 第 {0} 回合 ——',

        // ── Game over ────────────────────────────────────────────────────
        winner_announce: '🏆 {0} 获胜！({1}分)',
        player_col_short: '玩家',
        total_score_short: '总分',
        back_to_lobby: '返回大厅',
        game_over: '游戏结束',

        // ── Player board status ──────────────────────────────────────────
        status_offline: '📡 掉线',
        status_dead: '💀 已死亡 | 🏅{0}',
        status_alive: '❤️ 存活 | 🎴{0} | 🏅{1}',

        // ── Target selection ─────────────────────────────────────────────
        target_two: '「{0}」- 选择两名目标',
        target_one: '「{0}」- 选择目标',

        // ── Prompts ──────────────────────────────────────────────────────
        attacked_title: '⚔️ 你被攻击了！',
        attacked_by: '{0} 对你使用了{1}！',
        attack_assassin: '盲眼刺客',
        attack_shinobi: '上忍',
        use_mirror_monk: '🪞 使用经施僧（反杀）',
        use_martyr: '🕊️ 使用殉道者（获得分数）',
        accept_death: '😵 接受死亡',
        shinobi_decision: '🗡️ 上忍决定',
        target_identity: '目标 {0} 的身份是 {1} {2}',
        kill_btn: '⚔️ 击杀',
        spare_btn: '🕊️ 放过',
        graverobber_title: '🪦 掘墓人 - 选择一张卡牌',
        troublemaker_title: '🎭 捣蛋鬼',
        troublemaker_identity: '{0} 的身份是 {1} {2}',
        troublemaker_reveal_q: '是否公开揭示给所有人？',
        reveal_public: '📢 公开揭示',
        keep_secret: '🤫 不揭示',
        soul_merchant_title: '👻 灵魂商贩',
        soul_merchant_choose: '选择查看 {0} 的：',
        view_house: '🏠 流派身份',
        view_scores: '🏅 分数指示物',
        soul_merchant_swap_title: '👻 灵魂商贩 - 交换分数',
        soul_merchant_swap_q: '是否与 {0} 交换一枚分数指示物？',
        swap_btn: '🔄 交换',
        no_swap_btn: '❌ 不交换',
        shapeshifter_title: '🎭 百变者 - 互换身份',
        shapeshifter_swap_q: '是否互换 {0} 和 {1} 的身份？',
        swap_identity_btn: '🔄 互换',
        no_swap_identity_btn: '❌ 不互换',
        prompt_unknown: '提示',
        prompt_unknown_type: '未知提示类型: {0}',

        // ── Action results ───────────────────────────────────────────────
        reveal_identity: '揭示身份',
        reveal_hand_card: '揭示手牌',
        score_tokens_label: '分数指示物',
        card_gained: '获得卡牌: {0}',
        action_result: '行动结果',

        // ── Rank names ───────────────────────────────────────────────────
        rank_1: '密探',
        rank_2: '隐士',
        rank_3: '骗徒',
        rank_4: '盲眼刺客',
        rank_5: '上忍',
        rank_phase_fallback: '阶段 {0}',

        // ── Language switcher ────────────────────────────────────────────
        lang_zh: '中文',
        lang_en: 'English',

        // ── Tutorial ────────────────────────────────────────────────────
        tutorial_btn: '📖 新手教程',
    },

    en: {
        // ── Page title ───────────────────────────────────────────────────
        page_title: 'Night of Ninja Online',

        // ── Lobby ────────────────────────────────────────────────────────
        game_title: 'Night of Ninja',
        game_subtitle: 'Night of Ninja Online',
        player_name_label: 'Player Name',
        player_name_placeholder: 'Enter your name',
        select_avatar: 'Select Avatar',
        create_room: 'Create Room',
        or_divider: 'or',
        room_code_placeholder: 'Room Code',
        join_room: 'Join Room',

        // ── Waiting room ─────────────────────────────────────────────────
        room_code_label: 'Room Code',
        copy_btn: 'Copy',
        leave_room: 'Leave Room',
        waiting_players: 'Waiting for players...',
        room_settings: 'Room Settings',
        winning_threshold_label: 'Points to Win',
        start_game: 'Start Game',

        // ── Game header ──────────────────────────────────────────────────
        preparing: 'Preparing...',
        waiting_start: 'Waiting for game to start',
        round_label: 'Round',
        phase_label: 'Phase',
        win_target: 'Win Target:',
        my_honor_total: 'My Honor:',
        my_honor_count: 'My Badges:',

        // ── Player info ──────────────────────────────────────────────────
        your_house: 'Your House:',

        // ── Draft ────────────────────────────────────────────────────────
        saved_cards: 'Saved Cards',
        your_hand: 'Your Hand',
        select_cards_placeholder: 'Selected cards\nappear here',

        // ── Game log ─────────────────────────────────────────────────────
        game_log: 'Game Log',

        // ── Modals ───────────────────────────────────────────────────────
        select_target: 'Select Target',
        cancel: 'Cancel',
        info: 'Info',
        ok: 'OK',
        confirm: 'Confirm',

        // ── Prompt modal ─────────────────────────────────────────────────
        decision: 'Decision',

        // ── Dynamic strings ──────────────────────────────────────────────
        room_code_copied: 'Room code copied',
        enter_name: 'Please enter your name',
        enter_room_code: 'Please enter 4-digit room code',
        error_generic: 'Error',
        player_joined_room: '{0} joined the room',
        player_left_room: '{0} left the room',
        player_disconnected: '{0} disconnected',
        player_disconnected_short: '{0} offline',
        player_reconnected: '{0} reconnected',
        player_reconnected_short: '{0} reconnected',
        room_closed: 'Room closed',
        reconnect_success: 'Reconnected successfully',

        // ── Game phases ──────────────────────────────────────────────────
        house_assignment: 'House Assignment',
        house_assigned_desc: 'Your house card is ready. Waiting for draft to begin.',
        game_started_log: 'Game started! Check your house card.',
        house_tier: 'Tier {0}',

        // ── Draft phase ──────────────────────────────────────────────────
        draft_phase: 'Draft Phase {0}/2',
        draft_received: 'Received {0} cards, pick 1 to keep',
        draft_round_log: 'Draft round {0}: {1} cards',
        waiting_others_select: 'Waiting for other players…',
        draft_select_prompt: 'Round {0}/2: Pick 1 to keep',
        draft_discard: 'Discarded {0} cards',
        draft_pass: 'Passed {0} cards to the left',
        draft_kept: 'Kept "{0}", {1}',
        waiting_others: 'Waiting for others…',

        // ── Night phase ──────────────────────────────────────────────────
        night_phase: 'Night Phase - {0}',
        waiting_action: 'Waiting for action…',
        night_started: 'Night phase started!',
        your_turn: "It's your turn!",
        skip: 'Skip',
        confirm_skip: 'Confirm skip? Card stays in hand (cannot be used this phase).',
        skip_turn: 'Skip Turn',
        you_died: 'You are dead. Waiting for round to end…',
        waiting_others_action: 'Waiting for other players…',
        rank_phase: '—— {0} Phase ——',
        player_skipped: 'Player skipped',
        action_failed: 'Action failed',

        // ── Scoring ──────────────────────────────────────────────────────
        round_scoring: 'Round Scoring',
        view_results: 'View round results',
        house_won: '{0} wins!',
        ronin_won: 'Ronin wins alone!',
        round_tie: 'This round is a tie',
        player_col: 'Player',
        identity_col: 'Identity',
        status_col: 'Status',
        total_score_col: 'Total',
        your_score_tokens: 'Your score tokens: [{0}] = {1} pts',
        next_round: 'Next Round',
        waiting_host_next: 'Waiting for host to start next round…',
        waiting: 'Waiting…',
        new_round: 'New Round',
        waiting_draft: 'Waiting for draft to begin',
        round_number: '—— Round {0} ——',

        // ── Game over ────────────────────────────────────────────────────
        winner_announce: '🏆 {0} wins! ({1} pts)',
        player_col_short: 'Player',
        total_score_short: 'Total',
        back_to_lobby: 'Back to Lobby',
        game_over: 'Game Over',

        // ── Player board status ──────────────────────────────────────────
        status_offline: '📡 Offline',
        status_dead: '💀 Dead | 🏅{0}',
        status_alive: '❤️ Alive | 🎴{0} | 🏅{1}',

        // ── Target selection ─────────────────────────────────────────────
        target_two: '"{0}" - Select two targets',
        target_one: '"{0}" - Select target',

        // ── Prompts ──────────────────────────────────────────────────────
        attacked_title: '⚔️ You are under attack!',
        attacked_by: '{0} used {1} on you!',
        attack_assassin: 'Assassin',
        attack_shinobi: 'Shinobi',
        use_mirror_monk: '🪞 Use Mirror Monk (reflect)',
        use_martyr: '🕊️ Use Martyr (gain score)',
        accept_death: '😵 Accept death',
        shinobi_decision: '🗡️ Shinobi Decision',
        target_identity: 'Target {0} is {1} {2}',
        kill_btn: '⚔️ Kill',
        spare_btn: '🕊️ Spare',
        graverobber_title: '🪦 Graverobber - Pick a card',
        troublemaker_title: '🎭 Troublemaker',
        troublemaker_identity: '{0} is {1} {2}',
        troublemaker_reveal_q: 'Reveal to everyone?',
        reveal_public: '📢 Reveal publicly',
        keep_secret: '🤫 Keep secret',
        soul_merchant_title: '👻 Soul Merchant',
        soul_merchant_choose: 'Choose what to view for {0}:',
        view_house: '🏠 House identity',
        view_scores: '🏅 Score tokens',
        soul_merchant_swap_title: '👻 Soul Merchant - Swap Scores',
        soul_merchant_swap_q: 'Swap a score token with {0}?',
        swap_btn: '🔄 Swap',
        no_swap_btn: '❌ Don\'t swap',
        shapeshifter_title: '🎭 Shapeshifter - Swap Identities',
        shapeshifter_swap_q: 'Swap identities of {0} and {1}?',
        swap_identity_btn: '🔄 Swap',
        no_swap_identity_btn: '❌ Don\'t swap',
        prompt_unknown: 'Prompt',
        prompt_unknown_type: 'Unknown prompt type: {0}',

        // ── Action results ───────────────────────────────────────────────
        reveal_identity: 'Revealed Identity',
        reveal_hand_card: 'Revealed Hand Card',
        score_tokens_label: 'Score Tokens',
        card_gained: 'Card gained: {0}',
        action_result: 'Action Result',

        // ── Rank names ───────────────────────────────────────────────────
        rank_1: 'Spy',
        rank_2: 'Mystic',
        rank_3: 'Trickster',
        rank_4: 'Assassin',
        rank_5: 'Shinobi',
        rank_phase_fallback: 'Phase {0}',

        // ── Language switcher ────────────────────────────────────────────
        lang_zh: '中文',
        lang_en: 'English',

        // ── Tutorial ────────────────────────────────────────────────────
        tutorial_btn: '📖 Tutorial',
    },
};

let currentLang = 'zh';

/**
 * Translate a key, with optional placeholder substitution.
 * t('hello', 'world')  →  translations[lang].hello with {0} replaced by 'world'
 */
export function t(key, ...args) {
    let str = (translations[currentLang] && translations[currentLang][key])
        || (translations.zh[key])
        || key;
    args.forEach((val, i) => {
        str = str.replace(`{${i}}`, val);
    });
    return str;
}

/** Get current language code */
export function getLang() {
    return currentLang;
}

/** Set language and immediately re-apply all data-i18n elements */
export function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    localStorage.setItem('ninja_lang', lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('page_title');
    _applyDataI18n();
}

/** Apply translations to all elements with data-i18n attributes */
function _applyDataI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.placeholder = t(key);
    });
}

/** Initialize i18n – call once on DOMContentLoaded */
export function initI18n() {
    const saved = localStorage.getItem('ninja_lang');
    currentLang = saved && translations[saved] ? saved : 'zh';
    document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('page_title');
    _applyDataI18n();
    _createLanguageSwitcher();
}

/** Create the language switcher in the page */
function _createLanguageSwitcher() {
    const switcher = document.createElement('div');
    switcher.id = 'lang-switcher';
    switcher.innerHTML = `
        <button id="lang-toggle" class="lang-toggle-btn">
            <span class="lang-icon">🌐</span>
            <span class="lang-current">${currentLang === 'zh' ? '中文' : 'EN'}</span>
        </button>
        <div id="lang-dropdown" class="lang-dropdown">
            <div class="lang-option ${currentLang === 'zh' ? 'active' : ''}" data-lang="zh">🇨🇳 中文</div>
            <div class="lang-option ${currentLang === 'en' ? 'active' : ''}" data-lang="en">🇬🇧 English</div>
        </div>
    `;
    document.body.appendChild(switcher);

    const toggle = switcher.querySelector('#lang-toggle');
    const dropdown = switcher.querySelector('#lang-dropdown');

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
    });

    switcher.querySelectorAll('.lang-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const lang = opt.dataset.lang;
            setLanguage(lang);
            // Update active states
            switcher.querySelectorAll('.lang-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            // Update display
            toggle.querySelector('.lang-current').textContent = lang === 'zh' ? '中文' : 'EN';
            dropdown.classList.remove('show');
        });
    });

    // Close dropdown when clicking elsewhere
    document.addEventListener('click', () => dropdown.classList.remove('show'));
}
