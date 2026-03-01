// ── Card info lookup ──────────────────────────────────────────────────────────

export const CARD_INFO = {
    spy:          { name: '密探',     desc: '查看一名玩家的流派卡', rank: 1 },
    mystic:       { name: '隐士',     desc: '查看流派卡 + 一张手牌', rank: 2 },
    trickster: {
        shapeshifter:  { name: '百变者',   desc: '查看两名玩家身份，可互换',   rank: 3, num: 1 },
        graverobber:   { name: '掘墓人',   desc: '弃牌堆取一张卡',           rank: 3, num: 2 },
        troublemaker:  { name: '捣蛋鬼',   desc: '查看身份，可公开揭示',     rank: 3, num: 3 },
        soul_merchant: { name: '灵魂商贩', desc: '查看身份/分数，可交换',     rank: 3, num: 4 },
        thief:         { name: '窃贼',     desc: '揭示自己，偷一枚分数',     rank: 3, num: 5 },
        judge:         { name: '裁判',     desc: '揭示自己，无视防御处决',   rank: 3, num: 6 },
    },
    assassin:     { name: '盲眼刺客', desc: '直接击杀一名玩家',       rank: 4 },
    shinobi:      { name: '上忍',     desc: '查看身份后选择是否击杀', rank: 5 },
    mirror_monk:  { name: '经施僧',   desc: '被杀时反杀攻击者',       rank: null },
    martyr:       { name: '殉道者',   desc: '被杀时获得一枚分数',     rank: null },
    mastermind:   { name: '首脑',     desc: '存活到揭示即赢得本轮',   rank: null },
};

// ── House info ───────────────────────────────────────────────────────────────

export const HOUSE_INFO = {
    lotus: { name: '莲花',   color: 'hsl(210, 70%, 55%)' },   // 蓝
    crane: { name: '仙鹤',   color: 'hsl(350, 70%, 55%)' },   // 红
    ronin: { name: '浪人',   color: 'hsl(270, 60%, 58%)' },   // 紫
};

// ── Rank → Chinese name ──────────────────────────────────────────────────────

export const RANK_NAMES = {
    1: '密探',
    2: '隐士',
    3: '骗徒',
    4: '盲眼刺客',
    5: '上忍',
};

export function getCardName(card) {
    if (card.type === 'trickster' && card.variant) {
        const v = CARD_INFO.trickster[card.variant];
        return v ? v.name : card.variant;
    }
    return (CARD_INFO[card.type] || {}).name || card.type;
}

export function getCardDesc(card) {
    if (card.type === 'trickster' && card.variant) {
        const v = CARD_INFO.trickster[card.variant];
        return v ? v.desc : '';
    }
    return (CARD_INFO[card.type] || {}).desc || '';
}
