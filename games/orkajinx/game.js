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
    language: 'pt-BR',
    dictionary: palavrasPT,
    round: 1, // Agora sincronizado via DB
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
    setupLanguageButtons();
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) { inputs.roomCode.value = code; joinRoom(code); }
}

// --- UX: AUTOCOMPLETE & TECLADO ---
// (Mantido igual à versão anterior, resumido aqui para economizar espaço visual)
inputs.word.addEventListener('input', () => {
    const val = inputs.word.value.trim().toUpperCase();
    state.suggestionIndex = -1;
    if (val.length < 1) { suggestionsBox.style.display = 'none'; return; }
    state.currentSuggestions = state.dictionary.filter(w => w.startsWith(val) && !state.usedWords.includes(w)).slice(0, 5); 
    renderSuggestions(state.currentSuggestions);
});

inputs.word.addEventListener('keydown', (e) => {
    if (suggestionsBox.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
        e.preventDefault(); state.suggestionIndex++;
        if (state.suggestionIndex >= state.currentSuggestions.length) state.suggestionIndex = 0;
        updateSuggestionHighlight();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault(); state.suggestionIndex--;
        if (state.suggestionIndex < 0) state.suggestionIndex = state.currentSuggestions.length - 1;
        updateSuggestionHighlight();
    } else if (e.key === 'Enter' && state.suggestionIndex > -1) {
        e.preventDefault(); selectSuggestion(state.currentSuggestions[state.suggestionIndex]);
    }
});

function renderSuggestions(matches) {
    if (matches.length === 0) { suggestionsBox.style.display = 'none'; return; }
    suggestionsBox.innerHTML = '';
    matches.forEach((word, index) => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = word;
        div.dataset.index = index;
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
    inputs.word.value = word;
    suggestionsBox.style.display = 'none';
    state.suggestionIndex = -1;
    inputs.word.focus();
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
    state.isHost = true;
    enterRoom(data);
});

document.getElementById('btn-join').addEventListener('click', () => {
    const code = inputs.roomCode.value.toUpperCase();
    if (code.length < 4) return OrkaFX.toast('Código inválido', 'error');
    joinRoom(code);
});

document.getElementById('btn-leave').addEventListener('click', async () => {
    if(confirm("Sair da sala?")) {
        await supabase.from('jinx_room_players').delete().eq('player_id', state.playerId);
        window.location.reload();
    }
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
    
    // Zera last_word ao entrar
    await supabase.from('jinx_room_players').upsert({
        room_id: state.roomId, player_id: state.playerId, nickname: state.nickname, last_word: ''
    }, { onConflict: 'player_id, room_id' });

    document.getElementById('display-code').innerText = state.roomCode;
    handleRoomUpdate(roomData); // Sincroniza estado inicial
    subscribeToRoom();
}

// --- REALTIME ---
function subscribeToRoom() {
    supabase.channel(`room:${state.roomId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'jinx_room_players', filter: `room_id=eq.${state.roomId}` }, handlePlayerChange)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jinx_rooms', filter: `id=eq.${state.roomId}` }, handleRoomChange)
        .subscribe((status) => { if (status === 'SUBSCRIBED') fetchPlayers(); });
}

async function fetchPlayers() {
    const { data } = await supabase.from('jinx_room_players').select('*').eq('room_id', state.roomId);
    state.players = data || [];
    renderPlayers();
    checkMyStatus();
}

// PEDIDO 5: Atualizar lista imediatamente ao sair
function handlePlayerChange(payload) {
    if (payload.eventType === 'INSERT') {
        state.players.push(payload.new);
        OrkaFX.toast(`${payload.new.nickname} entrou!`, 'info');
    } else if (payload.eventType === 'UPDATE') {
        const index = state.players.findIndex(p => p.id === payload.new.id);
        if (index !== -1) state.players[index] = payload.new;
    } else if (payload.eventType === 'DELETE') {
        state.players = state.players.filter(p => p.id !== payload.old.id);
        if(payload.old.player_id === state.playerId) window.location.reload();
    }
    renderPlayers();
    checkMyStatus();
    checkGameLogic(); 
}

function handleRoomChange(payload) {
    handleRoomUpdate(payload.new);
}

function handleRoomUpdate(roomData) {
    if (roomData.used_words) state.usedWords = roomData.used_words;
    
    // PEDIDO 6: Sincronia de Rodadas
    if (roomData.current_round) {
        state.round = roomData.current_round;
        const roundCounter = document.getElementById('round-counter');
        if(roundCounter) roundCounter.innerText = `RODADA ${state.round}`;
    }

    if (roomData.status === 'waiting') {
        modalVictory.classList.remove('active');
        modalVictory.style.display = 'none';
        showScreen('waiting');
    } else if (roomData.status === 'playing') {
        modalVictory.classList.remove('active');
        modalVictory.style.display = 'none';
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
            // Destrava input para nova rodada
            inputs.word.disabled = false;
            inputs.word.value = '';
            inputs.word.focus();
            
            // PEDIDO 2: Animação suave (feita via CSS, aqui limpamos classes se precisar)
        } else if (myPlayer.is_ready) {
            inputs.word.disabled = true;
        }
    }
}

async function checkGameLogic() {
    if (!state.isHost || state.players.length === 0) return;
    const allReady = state.players.every(p => p.is_ready);
    
    if (allReady) {
        // PEDIDO 1: Timeouts reduzidos (3s -> 1.5s)
        setTimeout(async () => {
            // Re-fetch para garantir integridade
            const { data: currentPlayers } = await supabase.from('jinx_room_players').select('*').eq('room_id', state.roomId);
            const words = currentPlayers.map(p => p.current_word);
            const allMatch = words.every(w => w === words[0]);

            if (allMatch) {
                state.usedWords.push(words[0]); 
                await finishGame(words[0]);
            } else {
                const newWords = words.filter(w => !state.usedWords.includes(w));
                state.usedWords.push(...newWords); 
                await resetRound();
            }
        }, 1500); 
    }
}

async function resetRound() {
    // 1. Host calcula nova rodada
    const nextRound = state.round + 1;
    
    // 2. Atualiza jogadores: Move current_word -> last_word e limpa status
    // Usamos Promise.all para atualizar todos em paralelo (mais seguro que upsert parcial)
    const updatePromises = state.players.map(p => {
        return supabase.from('jinx_room_players')
            .update({
                is_ready: false,
                last_word: p.current_word || '', // Salva a palavra atual como antiga
                current_word: ''                 // Limpa a atual
            })
            .eq('id', p.id); // Usa o ID único da linha
    });

    await Promise.all(updatePromises);

    // 3. Atualiza Sala (Rodada + Palavras Usadas)
    await supabase.from('jinx_rooms')
        .update({ used_words: state.usedWords, current_round: nextRound })
        .eq('id', state.roomId);
}

// --- ENVIO ---
async function sendWord() {
    const word = inputs.word.value.trim().toUpperCase();
    
    if (!state.dictionary.includes(word)) return flashError();
    if (state.usedWords.includes(word)) {
        OrkaFX.toast('Palavra já utilizada!', 'error');
        return flashError();
    }

    inputs.word.disabled = true;
    suggestionsBox.style.display = 'none';

    await supabase.from('jinx_room_players')
        .update({ is_ready: true, current_word: word })
        .eq('player_id', state.playerId).eq('room_id', state.roomId);
}

function flashError() {
    inputs.word.style.borderColor = 'var(--status-wrong)';
    OrkaFX.shake('word-input'); 
    setTimeout(() => inputs.word.style.borderColor = '#333', 500);
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
    document.getElementById('winning-word').innerText = finalWord || "JINX!";
    
    if (state.isHost) {
        btnPlayAgain.textContent = "Jogar Novamente";
        btnPlayAgain.disabled = false;
        btnPlayAgain.onclick = resetGameRoom;
    } else {
        btnPlayAgain.textContent = "Aguardando Host...";
        btnPlayAgain.disabled = true;
    }

    modalVictory.style.display = 'flex';
    setTimeout(() => modalVictory.classList.add('active'), 10);
    OrkaFX.confetti(); 
}

async function resetGameRoom() {
    // Reset Total: Limpa palavras usadas, reseta rodada para 1
    await supabase.from('jinx_rooms')
        .update({ status: 'waiting', used_words: [], current_round: 1 }) 
        .eq('id', state.roomId);
        
    await supabase.from('jinx_room_players')
        .update({ is_ready: false, current_word: '', last_word: '' }) // Limpa ghost words também
        .eq('room_id', state.roomId);
}


// --- RENDERIZAÇÃO ---
function renderPlayers() {
    const grid = document.getElementById('players-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const allReady = state.players.length > 0 && state.players.every(pl => pl.is_ready);
    // Verifica vitória localmente para pintar de verde (Pedido 2)
    let isWin = false;
    if(allReady) {
        const words = state.players.map(p => p.current_word);
        isWin = words.every(w => w === words[0]);
    }

    // Lista de Espera (Lobby)
    const waitingList = document.getElementById('waiting-list');
    if (waitingList) {
        waitingList.innerHTML = state.players.map(p => `
            <div style="background:#222; padding:8px 15px; border-radius:20px; font-size:0.9rem; border:1px solid #333;">
                ${p.nickname}
            </div>
        `).join('');
        
        const btnStart = document.getElementById('btn-start');
        if (btnStart && state.isHost) {
            btnStart.style.display = 'block';
            btnStart.disabled = state.players.length < 2;
            btnStart.textContent = state.players.length < 2 ? "Aguardando Jogadores..." : "COMEÇAR JOGO";
        }
    }

    // Grid de Jogo
    state.players.forEach(p => {
        const isMe = p.player_id === state.playerId;
        const isReady = p.is_ready;
        let displayWord = '...';
        let cardClass = 'player-card';

        // Lógica de Classes e Display
        if (isReady) { 
            cardClass += ' ready'; 
            if (!allReady) displayWord = 'PRONTO'; 
        }
        if (allReady) { 
            displayWord = p.current_word || ''; 
            cardClass += ' revealed';
            if (isWin) cardClass += ' winner'; // Pinta de verde
        }

        // PEDIDO 7: Ghost Word
        const ghostWord = p.last_word || '';

        grid.innerHTML += `
            <div class="${cardClass}">
                <div class="player-avatar">
                    <span class="material-icons" style="color:#666; font-size:32px;">${isReady ? 'check_circle' : 'person'}</span>
                </div>
                <div class="player-nick" style="color:${isMe ? 'var(--orka-accent)' : '#888'}">
                    ${p.nickname}
                </div>
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
        const active = 'background:var(--orka-accent); color:white;';
        const inactive = 'background:#222; color:#888;';
        btnPt.style.cssText = lang === 'pt-BR' ? active : inactive;
        btnEn.style.cssText = lang === 'en-US' ? active : inactive;
    }
}

// Events
if (inputs.word) {
    inputs.word.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendWord(); });
}
document.getElementById('btn-send-word').addEventListener('click', sendWord);
document.getElementById('btn-start').addEventListener('click', async () => 
    await supabase.from('jinx_rooms').update({ status: 'playing' }).eq('id', state.roomId)
);

init();