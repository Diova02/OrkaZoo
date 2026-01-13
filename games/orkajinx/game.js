import { OrkaCloud, supabase } from '../../core/scripts/orka-cloud.js';
import { OrkaFX } from '../../core/scripts/orka-lib.js';
import { palavrasPT, palavrasEN } from './palavras.js';

// --- ESTADO LOCAL ---
let state = {
    roomId: null,
    roomCode: null,
    playerId: OrkaCloud.getPlayerId(),
    nickname: OrkaCloud.getNickname() || 'Anonimo',
    isHost: false,
    hostId: null,
    language: 'pt-BR',
    dictionary: palavrasPT,
    round: 1,
    players: [],
    usedWords: [],
    
    // Teclado
    suggestionIndex: -1,
    currentSuggestions: []
};

// --- DOM ELEMENTS ---
const screens = {
    lobby: document.getElementById('scene-lobby'),
    waiting: document.getElementById('scene-waiting'),
    game: document.getElementById('scene-game')
};

const inputs = {
    roomCode: document.getElementById('input-room-code'),
    word: document.getElementById('word-input')
};

const suggestionsBox = document.getElementById('suggestions-box');
const modalVictory = document.getElementById('modal-victory');
const btnPlayAgain = document.getElementById('btn-play-again');

// --- INICIALIZAÇÃO ---
async function init() {
    OrkaCloud.startSession('orkajinx');
    setupLanguageButtons();
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) { inputs.roomCode.value = code; joinRoom(code); }
}

// --- UX: INPUT E TECLADO ---
// (Lógica de autocomplete mantida igual, apenas garantindo funcionamento)
inputs.word.addEventListener('input', () => {
    const val = inputs.word.value.trim();
    state.suggestionIndex = -1;
    if (val.length < 1) { suggestionsBox.style.display = 'none'; return; }
    state.currentSuggestions = state.dictionary.filter(w => w.startsWith(val) && !state.usedWords.includes(w)).slice(0, 5); 
    renderSuggestions(state.currentSuggestions);
});

inputs.word.addEventListener('keydown', (e) => {
    if (suggestionsBox.style.display === 'none') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); state.suggestionIndex++; if (state.suggestionIndex >= state.currentSuggestions.length) state.suggestionIndex = 0; updateSuggestionHighlight(); } 
    else if (e.key === 'ArrowUp') { e.preventDefault(); state.suggestionIndex--; if (state.suggestionIndex < 0) state.suggestionIndex = state.currentSuggestions.length - 1; updateSuggestionHighlight(); } 
    else if (e.key === 'Enter' && state.suggestionIndex > -1) { e.preventDefault(); selectSuggestion(state.currentSuggestions[state.suggestionIndex]); }
});

function renderSuggestions(matches) {
    if (matches.length === 0) { suggestionsBox.style.display = 'none'; return; }
    suggestionsBox.innerHTML = '';
    matches.forEach((word, index) => {
        const div = document.createElement('div');
        div.className = 'suggestion-item'; div.textContent = word; div.dataset.index = index;
        div.onclick = () => selectSuggestion(word);
        suggestionsBox.appendChild(div);
    });
    suggestionsBox.style.display = 'block';
}

function updateSuggestionHighlight() {
    const items = suggestionsBox.querySelectorAll('.suggestion-item');
    items.forEach((item, idx) => {
        if (idx === state.suggestionIndex) { item.classList.add('selected'); item.scrollIntoView({ block: 'nearest' }); } 
        else item.classList.remove('selected');
    });
}

function selectSuggestion(word) {
    inputs.word.value = word; suggestionsBox.style.display = 'none'; state.suggestionIndex = -1; inputs.word.focus();
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#suggestions-box') && !e.target.closest('#word-input')) suggestionsBox.style.display = 'none';
});

// --- LÓGICA DE SALA ---

document.getElementById('btn-create').addEventListener('click', async () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const { data, error } = await supabase.from('jinx_rooms')
        .insert({ code, language: state.language, status: 'waiting', used_words: [], current_round: 1 })
        .select().single();
    
    if (error) return OrkaFX.toast('Erro ao criar sala', 'error');
    enterRoom(data);
});

document.getElementById('btn-join').addEventListener('click', () => {
    const code = inputs.roomCode.value.toUpperCase();
    if (code.length < 4) return OrkaFX.toast('Código inválido', 'error');
    joinRoom(code);
});

// Botão Sair (Substituindo confirm nativo)
document.getElementById('btn-leave').addEventListener('click', () => {
    openConfirmModal(
        "SAIR DA SALA?", 
        "Você voltará para o Hub e sairá desta partida.", 
        async () => await leaveRoomLogic()
    );
});

async function joinRoom(code) {
    const { data, error } = await supabase.from('jinx_rooms').select('*').eq('code', code).single();
    if (error || !data) return OrkaFX.toast('Sala não encontrada', 'error');
    enterRoom(data);
}

async function enterRoom(roomData) {
    state.roomId = roomData.id;
    state.roomCode = roomData.code;
    state.usedWords = roomData.used_words || [];
    setLang(roomData.language);
    
    await supabase.from('jinx_room_players').upsert({
        room_id: state.roomId, player_id: state.playerId, nickname: state.nickname, last_word: ''
    }, { onConflict: 'player_id, room_id' });

    document.getElementById('display-code').innerText = state.roomCode;
    handleRoomUpdate(roomData); 
    subscribeToRoom();
}

// LOGICA CENTRAL DE SAÍDA E LIMPEZA
async function leaveRoomLogic() {
    if (!state.roomId) return;

    if (state.isHost) {
        // Se HOST sai, APAGA A SALA (Cascade apaga players)
        await supabase.from('jinx_rooms').delete().eq('id', state.roomId);
    } else {
        // Se GUEST sai, apaga só ele
        await supabase.from('jinx_room_players').delete().eq('player_id', state.playerId);
    }
    
    // Redireciona para Hub
    window.location.href = '../../index.html'; 
}

// Cleanup ao fechar aba
window.onbeforeunload = () => {
    // Analytics: Salva a sessão e calcula o tempo
    OrkaCloud.endSession('orkajinx');
    
    if (state.roomId) {
        if (state.isHost) {
            supabase.from('jinx_rooms').delete().eq('id', state.roomId).then();
        } else {
            supabase.from('jinx_room_players').delete().eq('player_id', state.playerId).then();
        }
    }
};

// --- REALTIME ---
function subscribeToRoom() {
    const channel = supabase.channel(`room:${state.roomId}`);
    
    channel
        // ESCUTA INSERT/UPDATE COM FILTRO (Para eficiência)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jinx_room_players', filter: `room_id=eq.${state.roomId}` }, handlePlayerChange)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jinx_room_players', filter: `room_id=eq.${state.roomId}` }, handlePlayerChange)
        
        // ESCUTA DELETE SEM FILTRO DE ROOM_ID (Correção do Fantasma)
        // O Supabase não manda o room_id no delete, então precisamos escutar tudo e filtrar no JS
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'jinx_room_players' }, handlePlayerChange)
        
        // Listener da Sala
        .on('postgres_changes', { event: '*', schema: 'public', table: 'jinx_rooms', filter: `id=eq.${state.roomId}` }, handleRoomChange) 
        
        .subscribe((status) => { if (status === 'SUBSCRIBED') fetchPlayers(); });
}

async function fetchPlayers() {
    const { data } = await supabase.from('jinx_room_players')
        .select('*')
        .eq('room_id', state.roomId)
        .order('joined_at', { ascending: true }); // Host é sempre o mais antigo
        
    state.players = data || [];
    determineHost();
    renderPlayers();
    checkMyStatus();
}

function determineHost() {
    if (state.players.length > 0) {
        state.hostId = state.players[0].player_id;
        state.isHost = (state.hostId === state.playerId);
    }
}

function handlePlayerChange(payload) {
    if (payload.eventType === 'INSERT') {
        if (!state.players.find(p => p.id === payload.new.id)) {
            state.players.push(payload.new);
            OrkaFX.toast(`${payload.new.nickname} entrou!`, 'info');
        }
    } else if (payload.eventType === 'UPDATE') {
        const index = state.players.findIndex(p => p.id === payload.new.id);
        if (index !== -1) state.players[index] = payload.new;
    } else if (payload.eventType === 'DELETE') {
        // CORREÇÃO: Verifica se o ID deletado pertence à nossa sala
        const playerExists = state.players.find(p => p.id === payload.old.id);
        
        if (playerExists) {
            // Remove da lista local
            state.players = state.players.filter(p => p.id !== payload.old.id);
            OrkaFX.toast(`${playerExists.nickname} saiu.`, 'default'); // Toast em vez de alert

            // Se FUI EU quem fui deletado
            if(payload.old.player_id === state.playerId) {
                window.location.href = '../../index.html';
            }
        }
    }
    
    determineHost(); 
    renderPlayers();
    checkMyStatus();
    checkGameLogic(); 
}

function handleRoomChange(payload) {
    if (payload.eventType === 'DELETE') {
        // A SALA FOI EXCLUÍDA
        // Pequeno delay para o usuário ler antes de redirecionar
        OrkaFX.toast('A sala foi encerrada pelo anfitrião.', 'warning');
        setTimeout(() => {
            window.location.href = '../../index.html';
        }, 2000);
        return;
    }
    handleRoomUpdate(payload.new);
}

function handleRoomUpdate(roomData) {
    if (!roomData) return;
    if (roomData.used_words) state.usedWords = roomData.used_words;
    if (roomData.current_round) {
        state.round = roomData.current_round;
        const roundCounter = document.getElementById('round-counter');
        if(roundCounter) roundCounter.innerText = `RODADA ${state.round}`;
    }

    if (roomData.status === 'waiting') {
        modalVictory.classList.remove('active'); modalVictory.style.display = 'none';
        showScreen('waiting');
    } else if (roomData.status === 'playing') {
        modalVictory.classList.remove('active'); modalVictory.style.display = 'none';
        showScreen('game');
    } else if (roomData.status === 'finished') {
        if (!state.isHost) endGameUI(); 
    }
}

// --- GAMEPLAY ---

function checkMyStatus() {
    const myPlayer = state.players.find(p => p.player_id === state.playerId);
    if (myPlayer) {
        if (!myPlayer.is_ready && inputs.word.disabled && !modalVictory.classList.contains('active')) {
            inputs.word.disabled = false; inputs.word.value = ''; inputs.word.focus();
        } else if (myPlayer.is_ready) {
            inputs.word.disabled = true;
        }
    }
}

async function checkGameLogic() {
    if (!state.isHost || state.players.length === 0) return;
    const allReady = state.players.every(p => p.is_ready);
    
    if (allReady) {
        // Item 5: Verifica match IMEDIATAMENTE para soltar confete
        const { data: currentPlayers } = await supabase.from('jinx_room_players').select('*').eq('room_id', state.roomId);
        if(!currentPlayers) return; // Segurança

        const words = currentPlayers.map(p => p.current_word);
        const allMatch = words.every(w => w === words[0]);

        if (allMatch) {
            // CONFETE IMEDIATO (Item 5)
            OrkaFX.confetti(); 
            
            // Pequeno delay apenas para leitura rápida
            setTimeout(async () => {
                state.usedWords.push(words[0]); 
                await finishGame(words[0]);
            }, 800); // Reduzido de 1500 para 800ms
        } else {
            // Mismatch
            setTimeout(async () => {
                const newWords = words.filter(w => !state.usedWords.includes(w));
                state.usedWords.push(...newWords); 
                await resetRound();
            }, 1500);
        }
    }
}

async function resetRound() {
    const nextRound = state.round + 1;
    const updatePromises = state.players.map(p => 
        supabase.from('jinx_room_players')
            .update({ is_ready: false, last_word: p.current_word || '', current_word: '' })
            .eq('id', p.id)
    );
    await Promise.all(updatePromises);

    await supabase.from('jinx_rooms')
        .update({ used_words: state.usedWords, current_round: nextRound })
        .eq('id', state.roomId);
}

// --- ENVIO ---
async function sendWord() {
    const word = inputs.word.value.trim();
    if (!state.dictionary.includes(word)) return flashError();
    if (state.usedWords.includes(word)) { OrkaFX.toast('Palavra já utilizada!', 'error'); return flashError(); }

    inputs.word.disabled = true;
    suggestionsBox.style.display = 'none';

    await supabase.from('jinx_room_players')
        .update({ is_ready: true, current_word: word })
        .eq('player_id', state.playerId).eq('room_id', state.roomId);
}

function flashError() {
    inputs.word.style.borderColor = 'var(--status-wrong)'; OrkaFX.shake('word-input'); 
    setTimeout(() => inputs.word.style.borderColor = '#222', 500);
}

// --- FIM DE JOGO ---
async function finishGame(winningWord) {
    await supabase.from('jinx_room_history').insert({
        code: state.roomCode, player_names: state.players.map(p => p.nickname),
        rounds_count: state.round, result: 'win'
    });

    await supabase.from('jinx_rooms')
        .update({ status: 'finished', used_words: state.usedWords })
        .eq('id', state.roomId);
    
    endGameUI(winningWord);
}

function endGameUI(word) {
    let finalWord = word;
    if (!finalWord && state.players.length > 0) finalWord = state.players[0].current_word;

    document.getElementById('final-round').innerText = state.round;
    
    // Item 4: Formatação no Modal (Usando winning-word-box do CSS)
    document.getElementById('winning-word').innerText = finalWord || "JINX!";
    
    if (state.isHost) {
        btnPlayAgain.textContent = "JOGAR NOVAMENTE";
        btnPlayAgain.disabled = false;
        btnPlayAgain.onclick = resetGameRoom;
    } else {
        btnPlayAgain.textContent = "AGUARDANDO HOST...";
        btnPlayAgain.disabled = true;
    }

    modalVictory.style.display = 'flex';
    setTimeout(() => modalVictory.classList.add('active'), 10);
    // Confete reforço (caso o imediato tenha passado)
    OrkaFX.confetti(); 
}

async function resetGameRoom() {
    await supabase.from('jinx_rooms')
        .update({ status: 'waiting', used_words: [], current_round: 1 }) 
        .eq('id', state.roomId);
        
    const updatePromises = state.players.map(p => 
        supabase.from('jinx_room_players')
            .update({ is_ready: false, current_word: '', last_word: '' })
            .eq('id', p.id)
    );
    await Promise.all(updatePromises);
}

// --- RENDERIZAÇÃO ---
function renderPlayers() {
    const grid = document.getElementById('players-grid');
    if (!grid) return; grid.innerHTML = '';
    
    const allReady = state.players.length > 0 && state.players.every(pl => pl.is_ready);
    let isWin = false;
    if(allReady) {
        const words = state.players.map(p => p.current_word);
        isWin = words.every(w => w === words[0]);
    }

    // Lista de Espera (Lobby)
    const waitingList = document.getElementById('waiting-list');
    if (waitingList) {
        waitingList.innerHTML = state.players.map(p => `
            <div style="background:#222; padding:8px 15px; border-radius:20px; font-size:0.9rem; border:1px solid #333; display:flex; align-items:center; gap:5px;">
                ${p.player_id === state.hostId ? '👑' : ''} ${p.nickname}
            </div>
        `).join('');
        
        const btnStart = document.getElementById('btn-start');
        if (btnStart) {
            if (state.isHost) {
                btnStart.style.display = 'block';
                btnStart.disabled = state.players.length < 2;
                btnStart.textContent = state.players.length < 2 ? "Aguardando Jogadores..." : "COMEÇAR JOGO";
            } else {
                btnStart.style.display = 'none';
            }
        }
    }

    // Grid Principal
    state.players.forEach(p => {
        const isMe = p.player_id === state.playerId;
        const isHostPlayer = p.player_id === state.hostId;
        const isReady = p.is_ready;
        let displayWord = '...';
        let cardClass = 'player-card';

        if (isReady) { cardClass += ' ready'; if (!allReady) displayWord = 'PRONTO'; }
        if (allReady) { displayWord = p.current_word || ''; cardClass += ' revealed'; if (isWin) cardClass += ' winner'; }

        const ghostWord = p.last_word || '';

        grid.innerHTML += `
            <div class="${cardClass}">
                <div class="player-avatar">
                    ${isHostPlayer ? '<div class="host-crown">👑</div>' : ''}
                    <span class="material-icons" style="color:#666; font-size:32px;">${isReady ? 'check_circle' : 'person'}</span>
                </div>
                <div class="player-nick" style="color:${isMe ? 'var(--orka-accent)' : '#888'}">${p.nickname}</div>
                <div class="player-word-display">${displayWord}</div>
                <div class="last-word-display">${ghostWord}</div>
            </div>`;
    });
}

function showScreen(name) {
    Object.values(screens).forEach(s => s.style.display = 'none');
    screens[name].style.display = 'flex';
}

function setupLanguageButtons() {
    const btnPt = document.getElementById('btn-lang-pt');
    const btnEn = document.getElementById('btn-lang-en');
    if(btnPt) btnPt.onclick = () => setLang('pt-BR');
    if(btnEn) btnEn.onclick = () => setLang('en-US');
}

function setLang(lang) {
    state.language = lang;
    state.dictionary = (lang === 'en-US') ? palavrasEN : palavrasPT;
    const btnPt = document.getElementById('btn-lang-pt');
    const btnEn = document.getElementById('btn-lang-en');
    if (btnPt && btnEn) {
        const active = 'background:var(--orka-accent); color:white; border-color:var(--orka-accent);';
        const inactive = 'background:#111; color:#666; border-color:#333;';
        btnPt.style.cssText = lang === 'pt-BR' ? active : inactive;
        btnEn.style.cssText = lang === 'en-US' ? active : inactive;
    }
}

// Eventos
if (inputs.word) inputs.word.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendWord(); });
document.getElementById('btn-send-word').addEventListener('click', sendWord);
document.getElementById('btn-start').addEventListener('click', async () => 
    await supabase.from('jinx_rooms').update({ status: 'playing' }).eq('id', state.roomId)
);

// --- UTILITÁRIOS DE MODAL ---
const modalConfirm = document.getElementById('modal-confirm');
const confirmTitle = document.getElementById('confirm-title');
const confirmText = document.getElementById('confirm-text');
const btnConfirmOk = document.getElementById('btn-confirm-ok');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');

function openConfirmModal(title, text, onConfirmAction) {
    confirmTitle.innerText = title;
    confirmText.innerText = text;
    modalConfirm.style.display = 'flex';
    setTimeout(() => modalConfirm.classList.add('active'), 10);

    // Limpa eventos anteriores para não acumular
    const newOk = btnConfirmOk.cloneNode(true);
    const newCancel = btnConfirmCancel.cloneNode(true);
    btnConfirmOk.parentNode.replaceChild(newOk, btnConfirmOk);
    btnConfirmCancel.parentNode.replaceChild(newCancel, btnConfirmCancel);

    // Reatribui
    newOk.addEventListener('click', () => {
        closeConfirmModal();
        onConfirmAction();
    });
    
    newCancel.addEventListener('click', closeConfirmModal);
}

function closeConfirmModal() {
    modalConfirm.classList.remove('active');
    setTimeout(() => modalConfirm.style.display = 'none', 300);
}

init();