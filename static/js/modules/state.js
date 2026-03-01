// ── Reactive game state (singleton) ──────────────────────────────────────────

export const gameState = {
    // identity
    mySid: null,
    playerId: null,          // persistent across reconnects
    myName: null,
    myAvatar: Math.floor(Math.random() * 12) + 1,

    // room
    roomCode: null,
    isHost: false,
    winningThreshold: 10,

    // game
    phase: 'lobby',          // lobby | drafting | night | reveal | scoring | game_over
    myHouse: null,           // {house, number}
    myHand: [],              // [{id, type, rank, variant, number}, …]
    players: [],             // server player list (public view)
    roundNumber: 0,

    // draft
    draftRound: 0,
    currentDraftCards: [],
    draftedCards: [],

    // night
    currentRank: 0,
    currentAction: null,     // {rank, number, card_id, player_sid}

    // intel gathered this round
    revealedInfo: {},        // sid → { house?, handCards? }
    myScoreTokens: [],
    myTotalScore: 0,
};

export function resetRoundState() {
    gameState.myHand = [];
    gameState.draftRound = 0;
    gameState.currentDraftCards = [];
    gameState.draftedCards = [];
    gameState.currentRank = 0;
    gameState.currentAction = null;
    gameState.revealedInfo = {};
}
