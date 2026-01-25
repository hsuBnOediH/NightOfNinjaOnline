/**
 * Night of Ninja Online - Client-side Game Controller
 * Handles WebSocket communication and UI updates
 */

// Global state
let socket = null;
let gameState = {
    mySid: null,
    roomCode: null,
    myName: null,
    mySid: null,
    roomCode: null,
    myName: null,
    myAvatar: Math.floor(Math.random() * 12) + 1, // 1) Random initial avatar
    phase: 'lobby',
    phase: 'lobby',
    myHouse: null,
    myHand: [],
    currentRank: 0,
    selectedCard: null,
    isHost: false,
    currentDraftCards: [], // Current cards to choose from
    currentDraftCards: [], // Current cards to choose from
    draftedCards: [], // Cards already selected/kept during drafting (for UI display only)
    draftRound: 0, // Track current draft round to prevent UI race conditions
    revealedInfo: {}, // Store info revealed about other players {sid: {house: ..., cards: ...}}
    players: [] // Store current player list for hand counts
};

// Card metadata
const CARD_INFO = {
    spy: { name: '密探', description: '查看一名玩家的家族', rank: 1 },
    mystic: { name: '隐士', description: '查看家族+手牌', rank: 2 },
    trickster: {
        shapeshifter: { name: '百变者', description: '交换两名玩家的的身份(不可见)', rank: 3 },
        graverobber: { name: '掘墓人', description: '弃牌堆抽2张选1张', rank: 3 },
        troublemaker: { name: '捣乱者', description: '查看玩家身份并揭示(可选)', rank: 3 },
        soul_merchant: { name: '灵魂商贩', description: '查看身份并交换荣誉', rank: 3 },
        judge: { name: '裁判', description: '揭示自己并处决一名玩家', rank: 3 },
        thief: { name: '窃贼', description: '揭示自己并偷取荣誉', rank: 3 }
    },
    assassin: { name: '盲眼刺客', description: '盲杀一名玩家', rank: 4 },
    shinobi: { name: '上忍', description: '查看后选择是否击杀', rank: 5 },
    mirror_monk: { name: '还施僧', description: '反弹攻击', rank: null },
    martyr: { name: '殉道者', description: '死亡时获得额外荣誉', rank: null },
    mastermind: { name: '首脑', description: '回合结束存活即胜利', rank: null }
};

// ... (Rest of file unchanged until handleActionResult) ...



const HOUSE_INFO = {
    lotus: { name: '莲之家族', color: 'hsl(350, 70%, 50%)' },
    crane: { name: '鹤之家族', color: 'hsl(190, 70%, 50%)' },
    ronin: { name: '浪人', color: 'hsl(45, 80%, 55%)' }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    setupEventListeners();
    generateAvatarGrid();
});

function initializeSocket() {
    socket = io();

    socket.on('connected', (data) => {
        gameState.mySid = data.sid;
        console.log('Connected with SID:', data.sid);
    });

    socket.on('room_created', handleRoomCreated);
    socket.on('room_joined', handleRoomJoined);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('player_left', handlePlayerLeft);
    socket.on('game_started', (data) => { console.log('EVENT: game_started', data); handleGameStarted(data); });
    socket.on('draft_started', (data) => { console.log('EVENT: draft_started', data); handleDraftStarted(data); });
    socket.on('draft_continued', (data) => { console.log('EVENT: draft_continued', data); handleDraftContinued(data); });
    // Night phase
    socket.on('night_phase_started', (data) => { console.log('EVENT: night_phase_started', data); handleNightPhaseStarted(data); });
    socket.on('action_turn', (data) => { console.log('EVENT: action_turn', data); handleActionTurn(data); });
    socket.on('your_hand', (data) => { console.log('EVENT: your_hand', data); handleYourHand(data); });
    socket.on('rank_changed', (data) => { console.log('EVENT: rank_changed', data); handleRankChanged(data); });
    socket.on('card_played', (data) => { console.log('EVENT: card_played', data); handleCardPlayed(data); });
    socket.on('action_skipped', (data) => { console.log('EVENT: action_skipped', data); handleActionSkipped(data); });
    socket.on('turn_notification', (data) => { console.log('EVENT: turn_notification', data); handleTurnNotification(data); });
    socket.on('action_result', (data) => { console.log('EVENT: action_result', data); handleActionResult(data); });
    socket.on('round_complete', (data) => { console.log('EVENT: round_complete', data); handleRoundComplete(data); });
    socket.on('game_over', (data) => { console.log('EVENT: game_over', data); handleGameOver(data); });
    socket.on('error', (data) => { console.error('EVENT: error', data); handleError(data); });
}

function setupEventListeners() {
    // Lobby
    // Lobby
    document.getElementById('create-room-btn').addEventListener('click', createRoom);
    document.getElementById('join-room-btn').addEventListener('click', joinRoom);

    // 2) Room code input logic
    const roomInput = document.getElementById('room-code-input');
    roomInput.addEventListener('input', (e) => {
        // Force uppercase alphanumeric
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

        // Toggle buttons
        const hasValue = e.target.value.length > 0;
        document.getElementById('create-room-btn').style.display = hasValue ? 'none' : 'block';
        document.getElementById('join-room-btn').style.display = hasValue ? 'block' : 'none';

        // Auto-focus logic or enter key logic could go here
    });

    // Enter key support
    document.getElementById('player-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const code = document.getElementById('room-code-input').value;
            if (code) joinRoom();
            else createRoom();
        }
    });
    document.getElementById('room-code-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const code = e.target.value;
            if (code) joinRoom();
        }
    });

    // Copy Room Code
    const copyBtn = document.getElementById('copy-room-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const code = document.getElementById('display-room-code').textContent;
            navigator.clipboard.writeText(code).then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '已复制';
                setTimeout(() => copyBtn.textContent = originalText, 2000);
            }).catch(err => {
                console.error('Copy failed', err);
                showInfoModal('错误', '复制失败，请手动选择复制');
            });
        });
    }

    // Init state
    document.getElementById('join-room-btn').style.display = 'none';

    // Waiting room
    document.getElementById('leave-room-btn').addEventListener('click', leaveRoom);
    document.getElementById('start-game-btn').addEventListener('click', startGame);

    // Modals
    document.getElementById('cancel-target-btn').addEventListener('click', () => {
        hideModal('target-modal');
    });
    document.getElementById('close-info-btn').addEventListener('click', () => {
        hideModal('info-modal');
    });
}

function generateAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    for (let i = 1; i <= 12; i++) {
        const option = document.createElement('div');
        option.className = 'avatar-option';
        if (i === gameState.myAvatar) option.classList.add('selected');

        const img = document.createElement('img');
        img.src = `/static/img/avatar_${i}.png`;
        img.alt = `Avatar ${i}`;

        option.appendChild(img);
        option.addEventListener('click', () => selectAvatar(i, option));
        grid.appendChild(option);
    }
}

function selectAvatar(avatarNum, element) {
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');
    gameState.myAvatar = avatarNum;
}

// Room Actions
function createRoom() {
    const name = document.getElementById('player-name').value.trim();
    if (!name) {
        showInfoModal('提示', '请输入你的名字');
        return;
    }

    gameState.myName = name;
    socket.emit('create_room', {
        name: name,
        avatar: gameState.myAvatar
    });
}

function joinRoom() {
    const name = document.getElementById('player-name').value.trim();
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();

    if (!name) {
        showInfoModal('提示', '请输入你的名字');
        return;
    }

    if (!code || code.length !== 4) {
        showInfoModal('提示', '请输入4位房间代码');
        return;
    }

    gameState.myName = name;
    socket.emit('join_room', {
        room_code: code,
        name: name,
        avatar: gameState.myAvatar
    });
}

function leaveRoom() {
    location.reload();
}

function startGame() {
    socket.emit('start_game', {
        room_code: gameState.roomCode
    });
}

// Socket Event Handlers
function handleRoomCreated(data) {
    gameState.roomCode = data.room_code;
    gameState.isHost = true;

    document.getElementById('display-room-code').textContent = data.room_code;
    document.getElementById('start-game-btn').style.display = 'block';

    updatePlayerList(data.room.players);
    showScreen('waiting-screen');
}

function handleRoomJoined(data) {
    gameState.roomCode = data.room_code;
    gameState.isHost = false;

    document.getElementById('display-room-code').textContent = data.room_code;

    updatePlayerList(data.room.players);
    showScreen('waiting-screen');
}

function handlePlayerJoined(data) {
    updatePlayerList(data.room.players);
    addLog(`${data.player.name} 加入了房间`);
}

function handlePlayerLeft(data) {
    updatePlayerList(data.room.players);
    addLog(`${data.player.name} 离开了房间`);
}

function handleGameStarted(data) {
    gameState.myHouse = data.your_house;
    gameState.phase = 'assignment';

    // Display house with tier
    const houseDisplay = document.getElementById('house-display');
    const houseImg = document.getElementById('house-img');
    const houseName = document.getElementById('house-name');
    const houseTier = document.getElementById('house-tier');

    houseImg.src = `/static/img/${data.your_house.house}.png`;
    houseName.textContent = HOUSE_INFO[data.your_house.house].name;
    houseName.style.color = HOUSE_INFO[data.your_house.house].color;
    houseTier.textContent = `层级 ${data.your_house.number} 号`;

    showScreen('game-screen');
    updateStageGuidance('家族分配', '你已收到家族卡，等待卡牌轮抽开始');
    addLog('游戏开始！你已收到家族卡');

    // Update player board
    updatePlayerBoard(data.room.players);
}

function handleDraftStarted(data) {
    gameState.phase = 'drafting';
    gameState.draftRound = data.round;
    gameState.currentDraftCards = data.cards;
    gameState.draftedCards = []; // Reset at start of drafting
    document.getElementById('phase-indicator').textContent = `轮抽阶段 ${data.round}/2`;

    const passCount = data.cards.length - 1;
    updateStageGuidance(
        `第 ${data.round}/2 轮卡牌轮抽`,
        `选择 1 张卡牌保留，其余 ${passCount} 张将传递给左边的玩家`
    );

    // Show draft collection panel
    document.getElementById('draft-collection-panel').style.display = 'block';
    updateDraftCollection();

    renderDraftCards(data.cards, data.round);
    addLog(`轮抽第 ${data.round} 轮：收到 ${data.cards.length} 张卡牌`);
}

function handleDraftContinued(data) {
    gameState.draftRound = data.round;
    gameState.currentDraftCards = data.cards;
    document.getElementById('phase-indicator').textContent = `轮抽阶段 ${data.round}/2`;

    if (data.round === 2) {
        // Round 2: Select 1, Discard 1
        updateStageGuidance(
            `第 ${data.round}/2 轮卡牌轮抽`,
            '从右边玩家收到 2 张卡牌，选择 1 张保留，剩余 1 张弃掉'
        );
        renderDraftCards(data.cards, data.round);
        addLog(`轮抽第 ${data.round} 轮：收到 ${data.cards.length} 张卡牌`);
    } else {
        const passCount = data.cards.length - 1;
        updateStageGuidance(
            `第 ${data.round}/2 轮卡牌轮抽`,
            `从右边玩家收到 ${data.cards.length} 张卡牌，选择 1 张保留，其余 ${passCount} 张传递给左边`
        );
        renderDraftCards(data.cards, data.round);
        addLog(`轮抽第 ${data.round} 轮：收到 ${data.cards.length} 张卡牌`);
    }
}

// Helper to map rank number to name
function getRankName(rank) {
    const map = {
        1: '密探',
        2: '隐士',
        3: '骗徒',
        4: '盲眼刺客',
        5: '上忍'
    };
    return map[rank] || `点数 ${rank}`;
}

function handleNightPhaseStarted(data) {
    gameState.phase = 'night';
    gameState.currentRank = data.current_rank;
    gameState.currentAction = null; // Reset current action

    // Update players to get hand counts
    if (data.room && data.room.players) {
        updatePlayerBoard(data.room.players);
    }

    // Hide draft collection panel
    document.getElementById('draft-collection-panel').style.display = 'none';
    gameState.draftedCards = [];

    document.getElementById('round-number').textContent = data.round;
    const rankName = getRankName(data.current_rank);
    document.getElementById('phase-indicator').textContent = `夜晚阶段 - ${rankName}`;

    updateStageGuidance(
        `夜晚阶段 - ${rankName}`,
        `${rankName} (点数 ${data.current_rank}) 优先行动，点击你的卡牌使用`
    );

    addLog(`夜晚阶段开始！`);
}

function handleActionTurn(data) {
    // New turn logic handling active card by index
    gameState.currentRank = data.rank;
    gameState.currentAction = data; // Store full action data {rank, number, player_sid, card_index}

    document.getElementById('phase-indicator').textContent = `夜晚阶段 - ${getRankName(data.rank)}`;

    // Update hand to highlight active card if it's ours
    renderHand(gameState.myHand);

    // Update instruction text
    const instruction = document.getElementById('hand-title');

    // Privacy Guard: Check if this action is actually for me
    if (data.player_sid === gameState.mySid) {
        instruction.innerHTML = `
            轮到你了：请打出编号 #${data.number} 的卡牌
            <button id="skip-btn" class="btn btn-secondary" style="margin-left:15px; padding:4px 12px; font-size:0.8em; vertical-align:middle;">跳过</button>
        `;
        instruction.style.color = 'var(--success)';
        addLog(`轮到你了：请打出编号 #${data.number} 的卡牌`);

        document.getElementById('skip-btn').onclick = () => {
            console.log('Skip button clicked');
            try {
                showConfirm('确认跳过本回合？卡牌将保留在手中，但本轮无法再次使用。', '跳过回合', () => {
                    console.log('Skip confirmed');
                    socket.emit('skip_turn', { room_code: gameState.roomCode });
                });
            } catch (e) {
                console.error('Error showing confirm modal:', e);
            }
        };
    } else {
        // User requested anonymity: "只说其他玩家 就行"
        instruction.textContent = '等待其他玩家行动...';
        instruction.style.color = 'var(--text-secondary)';
    }
}

function handleYourHand(data) {
    gameState.myHand = data.cards;
    renderHand(data.cards);
}

function handleRankChanged(data) {
    gameState.currentAction = null;
    gameState.currentRank = data.current_rank;
    const rankName = getRankName(data.current_rank);
    document.getElementById('phase-indicator').textContent = `夜晚阶段 - ${rankName}`;

    updateStageGuidance(
        `夜晚阶段 - ${rankName}`,
        data.current_rank === 5 ? '最后一个阶段，上忍可以行动' : `${rankName} 的卡牌现在可以使用`
    );

    // Clear instruction if not our turn
    const instruction = document.getElementById('hand-title');
    if (instruction.textContent.includes('轮到你了')) {
        instruction.textContent = '等待其他玩家行动...';
        instruction.style.color = 'var(--text-secondary)';
    }

    renderHand(gameState.myHand);
    addLog(`现在是 ${rankName} 阶段`);
}

function handleCardPlayed(data) {
    addLog(data.result.message);

    // Remove played card from revealed info if present
    const pSid = data.player.sid;
    if (gameState.revealedInfo[pSid] && gameState.revealedInfo[pSid].handCards) {
        const played = data.card;
        // Find index
        const idx = gameState.revealedInfo[pSid].handCards.findIndex(c =>
            (c.type || c.card_type) === (played.type || played.card_type) && c.number === played.number
        );
        if (idx !== -1) {
            gameState.revealedInfo[pSid].handCards.splice(idx, 1);
        }
    }

    gameState.currentAction = null;
    updatePlayerBoard(data.room.players);

    // Reset instruction text if it was my turn
    if (data.player.sid === gameState.mySid) {
        const instruction = document.getElementById('hand-title');
        instruction.textContent = '等待其他玩家行动...';
        instruction.style.color = 'var(--text-secondary)';
    }

    // Refresh hand to disable cards
    renderHand(gameState.myHand);
}

function handleActionSkipped(data) {
    addLog(data.message || '玩家跳过了回合');
    gameState.currentAction = null;

    // Reset instruction text if it was my turn
    if (data.player_sid === gameState.mySid) {
        const instruction = document.getElementById('hand-title');
        instruction.textContent = '等待其他玩家行动...';
        instruction.style.color = 'var(--text-secondary)';
    }

    // Refresh hand to disable cards
    renderHand(gameState.myHand);
}

function handleTurnNotification(data) {
    // Reset UI to waiting state for everyone
    // Active player will receive action_turn immediately after to override this
    gameState.currentAction = null;

    const instruction = document.getElementById('hand-title');
    instruction.textContent = data.message;
    instruction.style.color = 'var(--text-secondary)';

    // Refresh hand to disable any currently active cards
    renderHand(gameState.myHand);
}



function handleRoundComplete(data) {
    gameState.phase = 'scoring';

    let message = `回合结束！\n`;
    if (data.winning_house) {
        message += `${HOUSE_INFO[data.winning_house].name} 获胜！\n`;
        message += `存活者：${data.survivors.map(s => s.name).join(', ')}`;
    }

    showInfoModal('回合结算', message);
    addLog(message);
}

function handleGameOver(data) {
    let message = '游戏结束！\n\n最终排名：\n';
    data.scores.forEach((item, index) => {
        message += `${index + 1}. ${item.player.name} - ${item.score} 荣誉\n`;
    });

    showInfoModal('游戏结束', message);
}

function handleError(data) {
    showInfoModal('错误', data.message);
}

// UI Rendering
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function updatePlayerList(players) {
    const list = document.getElementById('waiting-player-list');
    list.innerHTML = '';

    players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-card';

        const img = document.createElement('img');
        img.src = `/static/img/avatar_${player.avatar}.png`;
        img.alt = player.name;

        const name = document.createElement('div');
        name.className = 'player-name';
        name.textContent = player.name;

        card.appendChild(img);
        card.appendChild(name);
        list.appendChild(card);
    });
}

function updatePlayerBoard(players) {
    gameState.players = players; // Cache for logic
    const board = document.getElementById('player-board');
    board.innerHTML = '';

    const numPlayers = players.length;
    const angleStep = (2 * Math.PI) / numPlayers;
    const radius = 250;

    players.forEach((player, index) => {
        const angle = angleStep * index - Math.PI / 2;
        const x = Math.cos(angle) * radius + 250;
        const y = Math.sin(angle) * radius + 250;

        const position = document.createElement('div');
        position.className = 'player-position';
        position.dataset.sid = player.sid; // Fix: Set dataset.sid
        position.style.left = `${x}px`;
        position.style.top = `${y}px`;
        position.style.transform = 'translate(-50%, -50%)';

        if (player.sid === gameState.mySid) {
            position.classList.add('you');
        }

        if (!player.alive) {
            position.classList.add('dead');
        }

        const avatar = document.createElement('img');
        avatar.className = 'player-avatar';
        avatar.src = `/static/img/avatar_${player.avatar}.png`;
        avatar.alt = player.name;

        const name = document.createElement('div');
        name.className = 'player-name';
        name.textContent = player.name;

        const status = document.createElement('div');
        status.className = 'player-status';
        // Show honor count (if game over or self?) - usually hidden.
        // Let's show Hand Count + Alive Status
        status.innerHTML = player.alive
            ? `<div>❤️ 存活</div><div style="margin-top:2px;">🎴 ${player.hand_count}</div>`
            : '💀 已死亡';

        position.appendChild(avatar);
        position.appendChild(name);
        position.appendChild(status);

        // Render revealed info badge (House)
        if (gameState.revealedInfo && gameState.revealedInfo[player.sid]) {
            const info = gameState.revealedInfo[player.sid];

            // House Badge
            if (info.house) {
                const badge = document.createElement('div');
                badge.className = 'revealed-badge';
                badge.style.cssText = `
                    position: absolute;
                    top: -10px;
                    right: -10px;
                    background: ${HOUSE_INFO[info.house.house].color};
                    color: white;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 0.8em;
                    font-weight: bold;
                    border: 2px solid white;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.5);
                    z-index: 10;
                    display: flex; 
                    align-items: center;
                `;
                badge.innerHTML = `<img src="/static/img/${info.house.house}.png" style="width:16px;height:16px;margin-right:4px;">${info.house.number}`;
                position.appendChild(badge);
            }

            // Revealed Hand Cards (displayed next to avatar)
            if (info.handCards && info.handCards.length > 0) {
                const cardContainer = document.createElement('div');
                cardContainer.className = 'revealed-cards';
                cardContainer.style.cssText = `
                    position: absolute;
                    bottom: -30px;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    gap: 4px;
                    z-index: 9;
                `;

                info.handCards.forEach(c => {
                    const cType = c.type || c.card_type;
                    let miniImg = `/static/img/${cType}.png`;
                    if (cType === 'trickster') miniImg = `/static/img/trickster.png`;

                    const miniCard = document.createElement('img');
                    miniCard.src = miniImg;
                    miniCard.style.cssText = `
                        width: 40px;
                        height: 56px;
                        border-radius: 4px;
                        border: 1px solid #fff;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.5);
                    `;
                    // Optional: Tooltip
                    const cInfo = (cType === 'trickster' && c.variant) ? CARD_INFO.trickster[c.variant] : CARD_INFO[cType];
                    miniCard.title = `${cInfo ? cInfo.name : cType} ${c.number || ''}`;

                    cardContainer.appendChild(miniCard);
                });
                position.appendChild(cardContainer);
            }
        }

        board.appendChild(position);
    });
}

function renderDraftCards(cards, round, autoSelect = false) {
    const hand = document.getElementById('card-hand');
    const title = document.getElementById('hand-title');
    hand.innerHTML = '';

    if (cards.length === 0) {
        title.textContent = '等待其他玩家选择...';
        hand.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 40px;">请稍候...</p>';
        return;
    }

    if (autoSelect) {
        // 第3轮：自动保留
        title.textContent = '最后1张卡牌（自动保留）';
        const cardEl = createCardElement(cards[0], 0, false);
        cardEl.style.border = '3px solid var(--success)';
        cardEl.style.boxShadow = '0 0 20px rgba(76, 175, 80, 0.5)';
        hand.appendChild(cardEl);
        return;
    }

    // 正常选择
    const passCount = cards.length - 1;
    title.textContent = `第 ${round}/2 轮：选择 1 张保留`;

    // 添加说明
    const instruction = document.createElement('div');
    instruction.style.cssText = `
        text-align: center;
        color: var(--text-secondary);
        margin-bottom: 16px;
        font-size: 0.9em;
    `;

    if (round === 2) {
        instruction.innerHTML = `
            🗑️ 选择后，剩余 1 张卡牌将<strong>被弃掉</strong>
        `;
    } else {
        instruction.innerHTML = `
            👈 选择后，剩余 <strong>${passCount}</strong> 张卡牌将传给<strong>左边玩家</strong>
        `;
    }
    hand.appendChild(instruction);

    // 卡牌容器
    const cardContainer = document.createElement('div');
    cardContainer.className = 'card-hand';

    cards.forEach((card, index) => {
        const cardEl = createCardElement(card, index, true);
        cardEl.addEventListener('click', () => selectDraftCard(index, card, cards));
        cardContainer.appendChild(cardEl);
    });

    hand.appendChild(cardContainer);
}

function selectDraftCard(index, selectedCard, allCards) {
    const hand = document.getElementById('card-hand');
    const title = document.getElementById('hand-title');
    const cards = hand.querySelectorAll('.ninja-card');
    const currentRound = gameState.draftRound; // Added: Store current draft round

    // Add to drafted cards for UI display
    gameState.draftedCards.push(selectedCard);

    // 禁用所有卡牌点击
    cards.forEach(card => {
        card.style.pointerEvents = 'none';
    });

    // 动画：选中的卡牌
    if (cards[index]) {
        cards[index].style.transition = 'all 0.5s ease';
        cards[index].style.transform = 'scale(1.1)';
        cards[index].style.border = '3px solid var(--success)';
        cards[index].style.boxShadow = '0 0 20px var(--success)';
    }

    // 动画：剩余卡牌向左传递
    setTimeout(() => {
        cards.forEach((cardEl, i) => {
            if (i !== index) {
                cardEl.style.transition = 'all 0.6s ease';
                cardEl.style.transform = 'translateX(-300px) rotate(-15deg)';
                cardEl.style.opacity = '0';
            }
        });

        // 计算传递数量
        const passingCount = allCards.length - 1;
        const cardName = selectedCard.type === 'trickster'
            ? CARD_INFO.trickster[selectedCard.variant].name
            : CARD_INFO[selectedCard.type].name;

        // 更新UI
        title.textContent = '等待其他玩家...';

        let actionMsg = `传递 ${passingCount} 张给左边玩家`;
        if (gameState.draftRound === 2) {
            actionMsg = `弃掉 ${passingCount} 张卡牌`;
        }

        addLog(`已选择保留「${cardName}」，${actionMsg}`);

        // Update draft collection display
        updateDraftCollection();

        // 发送选择
        socket.emit('select_draft_card', {
            room_code: gameState.roomCode,
            card_index: index
        });

        // 清空手牌区域显示等待
        setTimeout(() => {
            // Only show waiting screen if we are still in the same round
            // If the server responded quickly and we already moved to next round (or night phase),
            // we should NOT overwrite the new UI with the waiting screen.
            if (gameState.phase === 'drafting' && gameState.draftRound === currentRound) {
                hand.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                        <div style="font-size: 2em; margin-bottom: 16px;">⏳</div>
                        <p>已选择：<strong style="color: var(--success);">${cardName}</strong></p>
                        <p style="margin-top: 8px; font-size: 0.9em;">
                            ${actionMsg}<br>
                            等待其他玩家完成选择...
                        </p>
                    </div>
                `;
            }
        }, 600);
    }, 400);
}

function renderHand(cards) {
    const hand = document.getElementById('card-hand');
    const title = document.getElementById('hand-title');
    title.textContent = '你的手牌';
    hand.innerHTML = '';

    cards.forEach((card, index) => {
        // Only enable if it's my turn AND this specific card matches the action_turn rank/number
        let canPlay = false;
        if (gameState.currentAction &&
            gameState.currentAction.player_sid === gameState.mySid) {

            // Check based on Rank and Number (Robust)
            console.log(`Checking Card: Rank=${card.rank}, Num=${card.number} vs Action: Rank=${gameState.currentAction.rank}, Num=${gameState.currentAction.number}`);

            // Loose comparison (==) just in case types mismatch (string vs int)
            if (card.rank == gameState.currentAction.rank &&
                card.number == gameState.currentAction.number) {
                canPlay = true;
                console.log("-> MATCH! Card enabled.");
            } else {
                console.log("-> No match.");
            }
            // Fallback for cards without number? No, all ranked cards have number now.
        }

        const cardEl = createCardElement(card, index, canPlay);

        if (canPlay) {
            cardEl.style.boxShadow = '0 0 15px var(--accent)'; // Highlight active card
            cardEl.style.cursor = 'pointer';
            cardEl.style.pointerEvents = 'auto'; // Explicitly enable
            cardEl.addEventListener('click', (e) => {
                console.log("Card Clicked!", index, card);
                playCard(index, card);
                e.stopPropagation(); // Prevent bubbling issues?
            });
        } else {
            cardEl.style.pointerEvents = 'none'; // Explicitly disable others
            cardEl.style.opacity = '0.6';
        }

        hand.appendChild(cardEl);
    });
}

function createCardElement(card, index, enabled) {
    const cardEl = document.createElement('div');
    cardEl.className = 'ninja-card';
    if (!enabled) cardEl.classList.add('disabled');

    // Rank badge
    if (card.rank) {
        const rank = document.createElement('div');
        rank.className = 'card-rank';
        rank.textContent = card.rank;
        cardEl.appendChild(rank);

        // Number badge (Initiative) if exists
        if (card.number) {
            const numBadge = document.createElement('div');
            numBadge.className = 'card-number';
            numBadge.textContent = `#${card.number}`;
            // Style it via CSS (bottom right)
            numBadge.style.cssText = `
                position: absolute;
                bottom: 8px;
                right: 8px;
                background: rgba(0,0,0,0.7);
                color: #fff;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
                border: 1px solid rgba(255,255,255,0.3);
            `;
            cardEl.appendChild(numBadge);
        }
    }

    // Card image
    const img = document.createElement('img');
    img.className = 'card-image';

    if (card.type === 'trickster') {
        img.src = `/static/img/trickster.png`;
    } else {
        img.src = `/static/img/${card.type}.png`;
    }

    cardEl.appendChild(img);

    // Card name
    const name = document.createElement('div');
    name.className = 'card-name';

    if (card.type === 'trickster' && card.variant) {
        name.textContent = CARD_INFO.trickster[card.variant].name;
    } else {
        name.textContent = CARD_INFO[card.type].name;
    }

    cardEl.appendChild(name);

    // Description
    const desc = document.createElement('div');
    desc.className = 'card-description';

    if (card.type === 'trickster' && card.variant) {
        desc.textContent = CARD_INFO.trickster[card.variant].description;
    } else {
        desc.textContent = CARD_INFO[card.type].description;
    }

    cardEl.appendChild(desc);

    return cardEl;
}

function playCard(index, card) {
    console.log("playCard called", index, card);
    console.log("Current Phase:", gameState.phase);

    if (gameState.phase !== 'night') {
        console.warn("Not in night phase!", gameState.phase);
        return;
    }

    gameState.selectedCardIndex = index;

    // Spy Action Logic - Require Target
    // Includes: Spy, Mystic, Assassin, Shinobi
    // Trickster: Blind Archer, Troublemaker, Thief
    // Note: Shapeshifter (Trickster) might just swap self?
    // Let's assume Shapeshifter also needs target to swap WITH.
    const needsTarget = ['spy', 'mystic', 'assassin', 'shinobi'].includes(card.type) ||
        (card.type === 'trickster' && ['blind_archer', 'troublemaker', 'thief', 'shapeshifter'].includes(card.variant));

    console.log("Needs target?", needsTarget);

    if (needsTarget) {
        showTargetSelection(card);
        return;
    }

    // Play directly for others (e.g. Graverobber might pick from discard? Mastermind pass? Response cards?)
    // Response cards (Mirror Monk) are usually triggered by system or played in response. 
    // Here we allow playing them? Usually you don't 'play' Mirror Monk on your turn unless rules say so.
    // Assuming everything else is direct play.

    socket.emit('play_card', {
        room_code: gameState.roomCode,
        card_index: index
    });
}

// Queue for multi-selection
let selectionQueue = [];

function showTargetSelection(card) {
    const modal = document.getElementById('target-modal');
    const title = document.getElementById('target-modal-title');
    const container = document.getElementById('target-list');

    const cardName = card.type === 'trickster' ? CARD_INFO.trickster[card.variant].name : CARD_INFO[card.type].name;
    title.innerHTML = `使用「${cardName}」：选择目标<br><span style="font-size:0.6em;color:#aaa;">${getCardInstruction(card)}</span>`;

    container.innerHTML = '';
    selectionQueue = []; // Reset queue

    // Determine target validity logic
    const isSpy = card.type === 'spy';
    const isShapeshifter = card.type === 'trickster' && card.variant === 'shapeshifter';
    const isSelfTarget = (card.type === 'trickster' && ['judge', 'thief'].includes(card.variant));

    // If Logic is "Self handling" or "Graverobber" (no target needed usually, or special UI)
    if (card.type === 'trickster' && card.variant === 'graverobber') {
        // Graverobber: No target needed, just play.
        socket.emit('play_card', {
            room_code: gameState.roomCode,
            card_index: gameState.selectedCardIndex
        });
        return;
    }

    // Get players
    const players = document.querySelectorAll('.player-position');
    players.forEach(p => {
        const sid = p.dataset.sid;
        if (!sid) return;

        // Condition checks
        const isMe = (sid === gameState.mySid);
        const isDead = p.classList.contains('dead');
        const isRevealed = gameState.revealedInfo && gameState.revealedInfo[sid] && gameState.revealedInfo[sid].house;

        // Skip dead
        if (isDead) return;

        // Self check
        if (isMe && !isSelfTarget) return; // Normally skip self
        if (!isMe && isSelfTarget) return; // Only allow self for Judge/Thief? 
        // Wait, Judge kills OTHERS. Thief steals from OTHERS.
        // But Judge/Thief REVEAL SELF. 
        // Does client select "Self" or "Target"?
        // Judge: "Reveal self AND kill player". User selects VICTIM.
        // Thief: "Reveal self AND steal from player". User selects VICTIM.
        // So for Judge/Thief, isSelfTarget is FALSE for selection. We select ENEMY.
        // The "Reveal Self" side effect happens on server.

        let disabled = false;
        let reason = '';

        if (isSpy && isRevealed) {
            disabled = true;
            reason = '(已查看)';
        }

        const name = p.querySelector('.player-name').textContent;
        const nums = p.querySelector('.player-avatar').src.match(/avatar_(\d+)/);
        const avatarNum = nums ? nums[1] : 1;
        const avatarSrc = `/static/img/avatar_${avatarNum}.png`;

        const el = document.createElement('div');
        el.className = 'target-option';

        if (disabled) {
            el.classList.add('disabled');
            el.style.opacity = '0.5';
            el.style.cursor = 'not-allowed';
            el.innerHTML = `<img src="${avatarSrc}"><span>${name} ${reason}</span>`;
        } else {
            el.innerHTML = `<img src="${avatarSrc}"><span>${name}</span>`;
            el.onclick = () => handleTargetClick(sid, card, el);
        }
        container.appendChild(el);
    });

    showModal('target-modal');
}

function getCardInstruction(card) {
    if (card.type === 'trickster' && card.variant === 'shapeshifter') return '请选择 2 名玩家进行交换';
    return '点击选择目标';
}

function handleTargetClick(sid, card, el) {
    const isShapeshifter = card.type === 'trickster' && card.variant === 'shapeshifter';

    if (isShapeshifter) {
        // Toggle selection
        if (selectionQueue.includes(sid)) {
            selectionQueue = selectionQueue.filter(s => s !== sid);
            el.style.border = 'none';
        } else {
            if (selectionQueue.length < 2) {
                selectionQueue.push(sid);
                el.style.border = '2px solid var(--accent)';
            }
        }

        // If 2 selected, confirm? Or just auto-send?
        // Let's auto-send if 2
        if (selectionQueue.length === 2) {
            setTimeout(() => {
                showConfirm('确认交换这两名玩家的身份？', '交换身份', () => {
                    socket.emit('play_card', {
                        room_code: gameState.roomCode,
                        card_index: gameState.selectedCardIndex,
                        target_sid: selectionQueue[0],
                        extra_target_sid: selectionQueue[1]
                    });
                    hideModal('target-modal');
                    selectionQueue = [];
                }, () => {
                    // Reset selection
                    selectionQueue = [];
                    // Simple refresh: hide modal (user has to re-click card to open, simpler than deselecting visuals)
                    hideModal('target-modal');
                });
            }, 100);
        }
        return;
    }

    // Normal single selection
    console.log("Target selected:", sid);

    // Mystic Logic: Choose a card
    if (card.type === 'mystic') {
        let handCount = 0;
        if (gameState.players) {
            const targetP = gameState.players.find(p => p.sid === sid);
            if (targetP) handCount = targetP.hand_count;
        }

        if (handCount > 0) {
            console.log(`Mystic target has ${handCount} cards. Showing selector.`);
            showCardSelector(sid, handCount);
            hideModal('target-modal');
            return;
        }
    }

    socket.emit('play_card', {
        room_code: gameState.roomCode,
        card_index: gameState.selectedCardIndex,
        target_sid: sid
    });
    hideModal('target-modal');
}

function showCardSelector(targetSid, count) {
    // Reuse target modal or create new? Let's use a new simple overlay or reuse info-modal structure but custom.
    // Better: dynamic create

    // Check if selector exists
    let selector = document.getElementById('card-selector-modal');
    if (!selector) {
        selector = document.createElement('div');
        selector.id = 'card-selector-modal';
        selector.className = 'modal';
        selector.innerHTML = `
            <div class="modal-content">
                <h3>选择一张手牌查看</h3>
                <div id="card-selector-list" style="display:flex; justify-content:center; gap:10px; margin: 20px 0; flex-wrap:wrap;"></div>
                <button onclick="document.getElementById('card-selector-modal').classList.remove('active')">取消</button>
            </div>
        `;
        document.body.appendChild(selector);
    }

    const list = selector.querySelector('#card-selector-list');
    list.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const cardBack = document.createElement('div');
        cardBack.className = 'card-back-option';
        cardBack.style.cssText = `
            width: 80px;
            height: 112px;
            background: linear-gradient(135deg, #2a2a2a, #000);
            border: 2px solid #555;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #444;
            font-size: 2em;
            transition: all 0.2s ease;
            box-shadow: 0 4px 8px rgba(0,0,0,0.5);
            margin: 5px;
        `;
        cardBack.textContent = '?';

        cardBack.onmouseover = () => {
            cardBack.style.transform = 'translateY(-5px) scale(1.05)';
            cardBack.style.borderColor = 'var(--accent)';
            cardBack.style.color = 'var(--accent)';
            cardBack.style.boxShadow = '0 0 15px var(--accent)';
        };
        cardBack.onmouseout = () => {
            cardBack.style.transform = 'translateY(0) scale(1)';
            cardBack.style.borderColor = '#555';
            cardBack.style.color = '#444';
            cardBack.style.boxShadow = '0 4px 8px rgba(0,0,0,0.5)';
        };

        cardBack.onclick = () => {
            console.log("Selected card index:", i);
            socket.emit('play_card', {
                room_code: gameState.roomCode,
                card_index: gameState.selectedCardIndex,
                target_sid: targetSid,
                target_card_index: i
            });
            selector.classList.remove('active');
        };

        list.appendChild(cardBack);
    }

    selector.classList.add('active');
}


function updateDraftCollection() {
    const collection = document.getElementById('draft-collection');
    collection.innerHTML = '';

    if (gameState.draftedCards.length === 0) {
        collection.innerHTML = '<p style="text-align: center; color: var(--text-secondary); font-size: 0.9em; padding: 20px;">选择卡牌后<br>显示在此处</p>';
        return;
    }

    gameState.draftedCards.forEach((card, index) => {
        const cardEl = createCardElement(card, index, false);
        collection.appendChild(cardEl);
    });
}

function showModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
        el.classList.add('active');
        el.style.display = 'flex'; // Force display
        console.log(`Showing modal ${modalId}, display set to flex`);
    } else {
        console.error(`Modal ${modalId} not found`);
    }
}

function hideModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
        el.classList.remove('active');
        el.style.display = ''; // Reset inline style
    }
}

function showInfoModal(title, content) {
    document.getElementById('info-title').textContent = title;
    document.getElementById('info-content').innerHTML = content; // Changed to innerHTML
    showModal('info-modal');
}

function handleActionResult(data) {
    if (!data.success) {
        addLog(`行动失败: ${data.message}`);
        return;
    }

    let infoHtml = `<p style="font-size:1.1em; margin-bottom:15px;">${data.message}</p>`;

    if (data.effects) {
        data.effects.forEach(effect => {
            if (effect.type === 'reveal_house') {
                const houseType = effect.house.house;
                const hInfo = HOUSE_INFO[houseType] || { name: houseType, color: '#ccc' };
                infoHtml += `
                    <div style="margin-top:15px; padding:15px; border:2px solid ${hInfo.color}; border-radius:8px; text-align:center; background:rgba(0,0,0,0.3);">
                        <h4 style="color:${hInfo.color}; margin-bottom:10px;">揭示家族</h4>
                        <div style="display:flex; align-items:center; justify-content:center; gap:10px;">
                            <img src="/static/img/${houseType}.png" style="width:50px; height:50px; border-radius:4px;">
                            <div style="text-align:left;">
                                <div style="font-weight:bold; font-size:1.2em;">${hInfo.name}</div>
                                <div style="font-size:0.9em; opacity:0.8;">等级: ${effect.house.number}</div>
                            </div>
                        </div>
                    </div>
                `;
            }
            else if (effect.type === 'reveal_hand_card') {
                const cType = effect.card.type || effect.card.card_type;
                const cInfo = (cType === 'trickster' && effect.card.variant)
                    ? CARD_INFO.trickster[effect.card.variant]
                    : CARD_INFO[cType];
                const cName = cInfo ? cInfo.name : cType;

                // Determine image source
                let imgSrc = `/static/img/${cType}.png`;
                if (cType === 'trickster') {
                    imgSrc = `/static/img/trickster.png`;
                }

                // Store in revealed info
                if (!gameState.revealedInfo[effect.target]) {
                    gameState.revealedInfo[effect.target] = {};
                }
                if (!gameState.revealedInfo[effect.target].handCards) {
                    gameState.revealedInfo[effect.target].handCards = [];
                }
                // Avoid duplicates
                const existing = gameState.revealedInfo[effect.target].handCards.find(c =>
                    (c.type || c.card_type) === (effect.card.type || effect.card.card_type) && c.number === effect.card.number
                );
                if (!existing) {
                    gameState.revealedInfo[effect.target].handCards.push(effect.card);
                }

                infoHtml += `
                    <div style="margin-top:15px; padding:15px; border:1px solid #aaa; border-radius:8px; text-align:center; background:rgba(0,0,0,0.3);">
                        <h4 style="color:#ddd; margin-bottom:10px;">揭示手牌</h4>
                        <div style="display:flex; flex-direction:column; align-items:center;">
                            <img src="${imgSrc}" style="width:60px; height:auto; border-radius:4px; margin-bottom: 8px; box-shadow: 0 0 5px rgba(0,0,0,0.5);">
                            <div style="font-weight:bold; color:var(--accent); font-size:1.2em;">${cName}</div>
                            <div style="font-size:0.9em; color:#bbb;">${cName} ${effect.card.number || '?'}</div>
                        </div>
                    </div>
                `;
            }
            else if (effect.type === 'kill') {
                infoHtml += `
                    <div style="margin-top:15px; padding:15px; border:2px solid red; border-radius:8px; text-align:center; background:rgba(50,0,0,0.5);">
                        <h3 style="color:red;">☠️ 击杀成功 ☠️</h3>
                    </div>
                `;
            }
        });
    }

    // Update local state if house revealed
    if (data.effects) {
        data.effects.forEach(effect => {
            if (effect.type === 'reveal_house') {
                if (!gameState.revealedInfo[effect.target]) {
                    gameState.revealedInfo[effect.target] = {};
                }
                gameState.revealedInfo[effect.target].house = effect.house;
            }
        });
        // Refresh board to show icons
        // Need to get current players list. 
        // We can request it or just modify DOM? 
        // Safer to re-render if we had the list. 
        // gameState doesn't store full player list persistently? 
        // Actually updatePlayerBoard uses 'players' arg. 
        // Let's rely on server sending updates usually?
        // But for this, we just want to update UI. 
        // We can cheat: Call updatePlayerBoard with cached players if we have them?
        // The game doesn't seem to store 'allPlayers' in gameState.
        // But 'updatePlayerBoard' is called by 'handleCardPlayed' which receives room info.
        // 'handleActionResult' is private. It happens BEFORE 'card_played' broadcast updates everyone's board.
        // Wait, 'card_played' event comes right after action execution and contains 'room.players'.
        // So updatePlayerBoard IS called by handleCardPlayed.
        // So we just need to ensure revealedInfo is set BEFORE that.
        // handleActionResult comes privately. card_played comes broadcast.
        // If we set revealedInfo here, then handleCardPlayed (which calls updatePlayerBoard) will see it.
        // Perfect.
    }

    showInfoModal('行动结果', infoHtml);
}

function addLog(message) {
    const log = document.getElementById('game-log');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = message;
    log.insertBefore(entry, log.firstChild);

    // Keep only last 20 entries
    while (log.children.length > 20) {
        log.removeChild(log.lastChild);
    }
}

// Update stage guidance banner
function updateStageGuidance(title, description) {
    document.getElementById('stage-title').textContent = title;
    document.getElementById('stage-description').textContent = description;
}

function showConfirm(message, title, onConfirm, onCancel) {
    console.log('showConfirm called:', message);
    const modal = document.getElementById('confirm-modal');
    if (!modal) {
        console.error('Confirm modal not found in DOM!');
        return;
    }
    document.getElementById('confirm-title').textContent = title || '确认';
    document.getElementById('confirm-message').textContent = message;

    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');

    // Clear old listeners (cloning is a quick hack to remove listeners)
    const newOk = okBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newOk.onclick = () => {
        if (onConfirm) onConfirm();
        hideModal('confirm-modal');
    };

    newCancel.onclick = () => {
        if (onCancel) onCancel();
        hideModal('confirm-modal');
    };

    showModal('confirm-modal');
}
