// ── Card info lookup ──────────────────────────────────────────────────────────

import { getLang } from './i18n.js';

export const CARD_INFO = {
    spy: { name: { zh: '密探', en: 'Spy' }, desc: { zh: '查看一名玩家的流派卡', en: 'View a player\'s house card' }, rank: 1 },
    mystic: { name: { zh: '隐士', en: 'Mystic' }, desc: { zh: '查看流派卡 + 一张手牌', en: 'View house card + one hand card' }, rank: 2 },
    trickster: {
        shapeshifter: { name: { zh: '百变者', en: 'Shapeshifter' }, desc: { zh: '查看两名玩家身份，可互换', en: 'View two players\' identities, may swap' }, rank: 3, num: 1 },
        graverobber: { name: { zh: '掘墓人', en: 'Graverobber' }, desc: { zh: '弃牌堆取一张卡', en: 'Take a card from the discard pile' }, rank: 3, num: 2 },
        troublemaker: { name: { zh: '捣蛋鬼', en: 'Troublemaker' }, desc: { zh: '查看身份，可公开揭示', en: 'View identity, may reveal publicly' }, rank: 3, num: 3 },
        soul_merchant: { name: { zh: '灵魂商贩', en: 'Soul Merchant' }, desc: { zh: '查看身份/分数，可交换', en: 'View identity/score, may swap' }, rank: 3, num: 4 },
        thief: { name: { zh: '窃贼', en: 'Thief' }, desc: { zh: '揭示自己，偷一枚分数', en: 'Reveal self, steal a score token' }, rank: 3, num: 5 },
        judge: { name: { zh: '裁判', en: 'Judge' }, desc: { zh: '揭示自己，无视防御处决', en: 'Reveal self, execute (unblockable)' }, rank: 3, num: 6 },
    },
    assassin: { name: { zh: '盲眼刺客', en: 'Assassin' }, desc: { zh: '直接击杀一名玩家', en: 'Kill a player directly' }, rank: 4 },
    shinobi: { name: { zh: '上忍', en: 'Shinobi' }, desc: { zh: '查看身份后选择是否击杀', en: 'View identity, then choose to kill' }, rank: 5 },
    mirror_monk: { name: { zh: '经施僧', en: 'Mirror Monk' }, desc: { zh: '被杀时反杀攻击者', en: 'Reflect kill back to attacker' }, rank: null },
    martyr: { name: { zh: '殉道者', en: 'Martyr' }, desc: { zh: '被杀时获得一枚分数', en: 'Gain a score token when killed' }, rank: null },
    mastermind: { name: { zh: '首脑', en: 'Mastermind' }, desc: { zh: '存活到揭示即赢得本轮', en: 'Survive to reveal to win the round' }, rank: null },
};

// ── House info ───────────────────────────────────────────────────────────────

export const HOUSE_INFO = {
    lotus: { name: { zh: '莲花', en: 'Lotus' }, color: 'hsl(210, 70%, 55%)' },   // 蓝
    crane: { name: { zh: '仙鹤', en: 'Crane' }, color: 'hsl(350, 70%, 55%)' },   // 红
    ronin: { name: { zh: '浪人', en: 'Ronin' }, color: 'hsl(270, 60%, 58%)' },   // 紫
};

// ── Rank names ───────────────────────────────────────────────────────────────

export const RANK_NAMES = {
    zh: { 1: '密探', 2: '隐士', 3: '骗徒', 4: '盲眼刺客', 5: '上忍' },
    en: { 1: 'Spy', 2: 'Mystic', 3: 'Trickster', 4: 'Assassin', 5: 'Shinobi' },
};

export function getCardName(card) {
    const lang = getLang();
    if (card.type === 'trickster' && card.variant) {
        const v = CARD_INFO.trickster[card.variant];
        return v ? (v.name[lang] || v.name.zh) : card.variant;
    }
    const info = CARD_INFO[card.type];
    return info ? (info.name[lang] || info.name.zh) : card.type;
}

export function getCardDesc(card) {
    const lang = getLang();
    if (card.type === 'trickster' && card.variant) {
        const v = CARD_INFO.trickster[card.variant];
        return v ? (v.desc[lang] || v.desc.zh) : '';
    }
    const info = CARD_INFO[card.type];
    return info ? (info.desc[lang] || info.desc.zh) : '';
}

/** Get localized house name */
export function getHouseName(houseKey) {
    const lang = getLang();
    const info = HOUSE_INFO[houseKey];
    return info ? (info.name[lang] || info.name.zh) : '???';
}
