import { OrkaCloud, supabase } from '../../core/scripts/orka-cloud.js';
import { OrkaFX } from '../../core/scripts/orka-lib.js';
import { palavrasPT, palavrasEN } from './palavras.js';

// --- ESTADO LOCAL ---
let state = {
    roomId: null,
    roomCode: null,
    playerId: null, // <--- CORREÇÃO: Começa vazio, espera o Cloud
    nickname: 'Anonimo',
    isHost: false,
    hostId: null,
    language: 'pt-BR',
    dictionary: palavrasPT,
    round: 1,
    players: [],
    usedWords: [],
    
    // Teclado
    suggestionIndex: -1,
    currentSuggestions: [],

    timeLimit: 90,
    roundStartTime: null,
    timerInterval: null,
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

// --- UTILITÁRIOS DE TEXTO ---
function normalize(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const suggestionsBox = document.getElementById('suggestions-box');
const modalVictory = document.getElementById('modal-victory');
const btnPlayAgain = document.getElementById('btn-play-again');

// --- INICIALIZAÇÃO ---
async function init() {
    // 1. Inicia Sessão e Conexão (Espera carregar o perfil)
    await OrkaCloud.startSession('orkajinx');
    
    // 2. Agora é seguro pegar os dados do Cloud
    state.playerId = OrkaCloud.getUserId();
    state.nickname = OrkaCloud.getNickname() || 'Anonimo';
    state.language = OrkaCloud.getLanguage(); // Já vem do banco

    // 3. Aplica configurações iniciais
    setupLanguageButtons();
    setLang(state.language); // Aplica visualmente a língua carregada
    
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) { inputs.roomCode.value = code; joinRoom(code); }
}

// --- UX: INPUT E TECLADO ---
inputs.word.addEventListener('input', () => {
    const rawVal = inputs.word.value.trim();
    state.suggestionIndex = -1;

    if (rawVal.length < 1) { 
        suggestionsBox.style.display = 'none'; 
        return; 
    }

    const normVal = normalize(rawVal); // O que o usuário digitou (limpo)

    // Filtra ignorando Case e Acentos
    state.currentSuggestions = state.dictionary
        .filter(w => {
            const normWord = normalize(w); // Palavra do banco (limpa)
            return normWord.startsWith(normVal) && !state.usedWords.includes(w);
        })
        .slice(0, 5); 

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
        .insert({ code, language: state.language, status: 'waiting', used_words: [], current_round: 1, time_limit: 90, round_start_time: new Date() })
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
    window.location.href = 'index.html'; 
}

window.onbeforeunload = () => {
    OrkaCloud.endSession({ reason: 'tab_closed' });
    
    if (state.roomId) {
        if (state.isHost) {
            // Tenta deletar a sala antes de morrer
            // O uso de 'then' é importante para não travar, mas o navegador pode matar antes.
            // O ideal para garantir 100% seria usar navigator.sendBeacon, mas o supabase-js não suporta direto.
            // Esta é a melhor tentativa via JS padrão:
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
                window.location.href = 'index.html';
            }
        }
    }
    
    determineHost(); 
    renderPlayers();
    checkMyStatus();
    checkGameLogic(); 

    // --- NOVO: Atualiza UI do Modal de Vitória em tempo real ---
    const modalActive = document.getElementById('modal-victory').classList.contains('active');
    if (modalActive && state.isHost) {
        if (state.players.length < 2) {
            btnPlayAgain.disabled = true;
            btnPlayAgain.textContent = "AGUARDANDO JOGADORES...";
        } else {
            btnPlayAgain.disabled = false;
            btnPlayAgain.textContent = "JOGAR NOVAMENTE";
        }
    }
}

function handleRoomChange(payload) {
    if (payload.eventType === 'DELETE') {
        // A SALA FOI EXCLUÍDA
        // Pequeno delay para o usuário ler antes de redirecionar
        OrkaFX.toast('A sala foi encerrada pelo anfitrião.', 'warning');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        return;
    }
    handleRoomUpdate(payload.new);
}

function handleRoomUpdate(roomData) {
    if (!roomData) return;
    
    // CORREÇÃO 1: Atualiza contador de rodadas
    if (roomData.current_round) {
        state.round = roomData.current_round; // Atualiza o estado local IMEDIATAMENTE
        const roundCounter = document.getElementById('round-counter');
        // Usa o valor direto do banco para garantir consistência visual
        if(roundCounter) roundCounter.innerText = `RODADA ${roomData.current_round}`;
    }

    if (roomData.used_words) state.usedWords = roomData.used_words;
    
    // Timer Sincronizado
    if (roomData.round_start_time) {
        state.roundStartTime = roomData.round_start_time;
        state.timeLimit = roomData.time_limit || 90;
        if (roomData.status === 'playing') startLocalTimer();
    }

    // Gerenciamento de Telas
    if (roomData.status === 'waiting') {
        modalVictory.classList.remove('active'); modalVictory.style.display = 'none';
        showScreen('waiting');
    } 
    else if (roomData.status === 'playing') {
        modalVictory.classList.remove('active'); modalVictory.style.display = 'none';
        showScreen('game');
    } 
    else if (roomData.status === 'finished') {
        if (!state.isHost) showEndModal('win'); 
    }
    else if (roomData.status === 'timeout') {
        showEndModal('loss');
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
            // 1. Salva as palavras usadas (para não repetir na próxima)
            const newWords = words.filter(w => !state.usedWords.includes(w));
            state.usedWords.push(...newWords); 

            // 2. Espera 5 segundos (Jogadores veem o erro)
            setTimeout(() => {
                // 3. Mostra o botão para o Host
                showNextRoundButton();
            }, 1500);
        }}
}

async function resetRound() {
    // CORREÇÃO 1: Garante que estamos pegando a rodada atual e somando +1
    const nextRound = (state.round || 1) + 1;
    
    // Atualiza jogadores (Reseta palavras)
    const updatePromises = state.players.map(p => 
        supabase.from('jinx_room_players')
            .update({ is_ready: false, last_word: p.current_word || '', current_word: '' })
            .eq('id', p.id)
    );
    await Promise.all(updatePromises);

    // Atualiza a sala com a NOVA rodada e NOVO tempo
    await supabase.from('jinx_rooms')
        .update({ 
            used_words: state.usedWords, 
            current_round: nextRound,
            round_start_time: new Date() 
        })
        .eq('id', state.roomId);
}

// --- ENVIO ---
async function sendWord() {
    const rawInput = inputs.word.value.trim();
    
    // 1. Formata: Deixa "Bonito" (Ex: "ÁGUIA" -> "Águia")
    let finalWord = capitalize(rawInput); 

    // 2. Valida no Banco (Inteligente)
    // Se a palavra formatada já existe no dicionário (match perfeito), ótimo.
    const exactMatch = state.dictionary.includes(finalWord);
    
    if (!exactMatch) {
        // Se não achou exato, tenta achar ignorando acentos (Ex: usuário digitou "aguia")
        const normalizedInput = normalize(rawInput);
        const looseMatch = state.dictionary.find(w => normalize(w) === normalizedInput);
        
        if (looseMatch) {
            // ACHOU! Substitui o input do usuário pela palavra correta do banco
            finalWord = looseMatch; 
        } else {
            // Não achou de jeito nenhum
            OrkaFX.toast('Palavra desconhecida!', 'error');
            return flashError();
        }
    }

    // 3. Verifica se já foi usada
    if (state.usedWords.includes(finalWord)) { 
        OrkaFX.toast('Palavra já utilizada!', 'error'); 
        return flashError(); 
    }

    // 4. Envia
    inputs.word.disabled = true;
    suggestionsBox.style.display = 'none';

    await supabase.from('jinx_room_players')
        .update({ is_ready: true, current_word: finalWord })
        .eq('player_id', state.playerId).eq('room_id', state.roomId);
}

function flashError() {
    inputs.word.style.borderColor = 'var(--status-wrong)'; OrkaFX.shake('word-input'); 
    setTimeout(() => inputs.word.style.borderColor = '#222', 500);
}

// --- FIM DE JOGO ---
async function finishGame(winningWord) {
    // ... (salvamento do histórico mantém igual) ...

    OrkaCloud.endSession({
        win: true,
        rounds: state.round,
        players: state.players.length,
        role: state.isHost ? 'host' : 'guest'
    });

    await supabase.from('jinx_rooms')
        .update({ status: 'finished', used_words: state.usedWords })
        .eq('id', state.roomId);
    
    // NOVO ANALYTICS V3
    OrkaCloud.endSession({
        win: true,
        rounds: state.round,
        players_count: state.players.length,
        winning_word: winningWord,
        role: state.isHost ? 'host' : 'guest'
    });

    // Host chama modal de vitória localmente
    showEndModal('win', winningWord);
}

// Substitui a antiga endGameUI
function showEndModal(type, word = null) {
    // Para o timer visualmente
    clearInterval(state.timerInterval);
    const timerDisplay = document.getElementById('timer-display');
    if(timerDisplay) timerDisplay.classList.add('panic');

    // Elementos do Modal
    const content = modalVictory.querySelector('.modal-content');
    const icon = modalVictory.querySelector('.victory-icon');
    const title = modalVictory.querySelector('.victory-title');
    const subtitle = modalVictory.querySelector('.victory-subtitle');
    const wordBox = document.getElementById('winning-word');
    
    // Configuração baseada no tipo
    if (type === 'win') {
        // --- MODO VITÓRIA ---
        content.classList.remove('defeat-mode');
        icon.innerText = "✨";
        title.innerText = "JINX!";
        subtitle.innerHTML = `Sincronia na rodada <span id="final-round">${state.round}</span>.`;
        
        // Descobre a palavra se não veio
        let finalWord = word;
        if (!finalWord && state.players.length > 0) finalWord = state.players[0].current_word;
        wordBox.innerText = finalWord || "JINX!";
        
        // Confete só na vitória!
        OrkaFX.confetti(); 
        
    } else {
        // --- MODO DERROTA ---
        content.classList.add('defeat-mode');
        icon.innerText = "💀"; // Caveira ou Relógio ⏰
        title.innerText = "TEMPO ESGOTADO!";
        subtitle.innerHTML = `Sem sincronia na rodada <span id="final-round">${state.round}</span>.`;
        wordBox.innerText = "TIMEOUT";
        
        // Sem confete :(
    }

    // Botões (Host vs Guest)
    if (state.isHost) {
        btnPlayAgain.textContent = "JOGAR NOVAMENTE";
        btnPlayAgain.disabled = false;
        // A função resetGameRoom já reseta para 'waiting', o que fecha o modal
        btnPlayAgain.onclick = resetGameRoom; 
    } else {
        btnPlayAgain.textContent = "AGUARDANDO HOST...";
        btnPlayAgain.disabled = true;
    }

    // Exibir
    modalVictory.style.display = 'flex';
    setTimeout(() => modalVictory.classList.add('active'), 10);
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
    // Verifica se ainda tem gente suficiente
    if (state.players.length < 2) {
        OrkaFX.toast("Jogadores insuficientes para reiniciar!", "error");
        // Opcional: Desabilita o botão visualmente
        btnPlayAgain.disabled = true;
        btnPlayAgain.textContent = "AGUARDANDO JOGADORES...";
        return; 
    }

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

// Variável de controle local para evitar múltiplos disparos
let isTimeoutProcessing = false;

function startLocalTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    isTimeoutProcessing = false;

    const timerDisplay = document.getElementById('timer-display');
    if (!timerDisplay) return;

    // MUDANÇA: Intervalo de 1000ms -> 250ms (4x mais rápido para precisão)
    state.timerInterval = setInterval(() => {
        if (!state.roundStartTime) return;

        const now = new Date().getTime();
        const start = new Date(state.roundStartTime).getTime();
        const end = start + (state.timeLimit * 1000);
        const diff = end - now;

        if (diff <= 0) {
            // TEMPO ESGOTADO!
            clearInterval(state.timerInterval); 
            timerDisplay.innerText = "00:00";
            timerDisplay.classList.add('panic');
            
            // Trava inputs imediatamente
            if (!inputs.word.disabled) {
                inputs.word.disabled = true;
                suggestionsBox.style.display = 'none';
                OrkaFX.shake('game-app');
            }

            // O Host dispara o Game Over no DB
            if (state.isHost && !isTimeoutProcessing) {
                isTimeoutProcessing = true; 
                handleTimeOut(); 
            }
        } else {
            // Apenas atualiza o visual (sem lógica pesada aqui)
            // Arredonda para cima para não mostrar 00:00 quando ainda tem 0.9s
            const totalSeconds = Math.ceil(diff / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            
            timerDisplay.innerText = `${minutes < 10 ? '0'+minutes : minutes}:${seconds < 10 ? '0'+seconds : seconds}`;
            
            if (diff < 10000) timerDisplay.classList.add('panic');
            else timerDisplay.classList.remove('panic');
        }
    }, 250); // <--- Checa 4 vezes por segundo
}

// Lógica do Host quando o tempo acaba
// Lógica do Host quando o tempo acaba
async function handleTimeOut() {
    clearInterval(state.timerInterval);
    
    // Atualiza o status da sala para 'timeout' (dispara o modal para todos)
    await supabase.from('jinx_rooms')
        .update({ status: 'timeout' }) 
        .eq('id', state.roomId);
        
    // (Opcional) Salvar no histórico como derrota se quiser, mas por simplicidade:
    // O Host verá o modal e decidirá se joga de novo.
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
    
    // Atualiza botões
    const btnPt = document.getElementById('btn-lang-pt');
    const btnEn = document.getElementById('btn-lang-en');
    
    if (btnPt && btnEn) {
        const active = 'background:var(--orka-accent); color:white; border-color:var(--orka-accent);';
        const inactive = 'background:#111; color:#666; border-color:#333;';
        btnPt.style.cssText = lang === 'pt-BR' ? active : inactive;
        btnEn.style.cssText = lang === 'en-US' ? active : inactive;
    }

    // --- LÓGICA DO TUTORIAL (NOVO) ---
    // Seleciona todos os elementos de texto
    const ptEls = document.querySelectorAll('.lang-pt');
    const enEls = document.querySelectorAll('.lang-en');

    if (lang === 'pt-BR') {
        ptEls.forEach(el => el.style.display = 'block'); // ou 'inline' dependendo do contexto, mas block funciona bem pra divs
        enEls.forEach(el => el.style.display = 'none');
    } else {
        ptEls.forEach(el => el.style.display = 'none');
        enEls.forEach(el => el.style.display = 'block');
    }
    
    // Salva preferência no OrkaCloud se quiser persistir entre reloads
    OrkaCloud.setLanguage(lang);
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

// --- HELPER: Botão de Próxima Rodada Dinâmico ---
// --- HELPER: Botão de Próxima Rodada (Corrigido) ---
function showNextRoundButton() {
    // Remove anterior se houver (segurança)
    const oldBtn = document.getElementById('btn-next-round-dynamic');
    if (oldBtn) oldBtn.remove();

    // Injeta estilo de animação se não existir
    if (!document.getElementById('anim-popin-style')) {
        const style = document.createElement('style');
        style.id = 'anim-popin-style';
        style.innerHTML = `
            @keyframes popInElastic {
                0% { transform: translateX(-50%) scale(0); opacity: 0; }
                60% { transform: translateX(-50%) scale(1.1); opacity: 1; }
                100% { transform: translateX(-50%) scale(1); opacity: 1; }
            }
            .btn-next-glow {
                background: linear-gradient(135deg, var(--orka-accent), #4a90e2);
                box-shadow: 0 0 20px rgba(0, 255, 136, 0.4);
                transition: transform 0.1s;
            }
            .btn-next-glow:active { transform: translateX(-50%) scale(0.95); }
        `;
        document.head.appendChild(style);
    }

    // Cria o botão
    const btn = document.createElement('button');
    btn.id = 'btn-next-round-dynamic';
    // Adiciona ícone para ficar menos seco
    btn.innerHTML = `<span class="material-icons" style="vertical-align:middle; margin-right:5px;">fast_forward</span> PRÓXIMA (5)`;
    btn.className = 'orka-btn btn-next-glow';
    
    // Estilo Flutuante
    btn.style.cssText = `
        position: fixed; 
        bottom: 15%; 
        left: 50%; 
        transform: translateX(-50%); 
        z-index: 9999; 
        padding: 12px 30px; 
        font-size: 1.1rem; 
        border-radius: 50px;
        border: 2px solid white;
        font-weight: bold;
        color: white;
        cursor: pointer;
        animation: popInElastic 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    `;
    
    document.body.appendChild(btn);

    let countdown = 5;
    let autoTimer = null;

    // Função de Avanço
    const goNext = () => {
        clearInterval(autoTimer);
        btn.style.opacity = '0'; // Feedback visual de saída
        setTimeout(() => { if(btn) btn.remove(); }, 200);
        resetRound(); 
    };

    // Clique Manual (CORRIGIDO: Sem OrkaFX.playClick)
    btn.onclick = () => {
        goNext();
    };

    // Contagem Regressiva
    autoTimer = setInterval(() => {
        countdown--;
        btn.innerHTML = `<span class="material-icons" style="vertical-align:middle; margin-right:5px;">fast_forward</span> PRÓXIMA (${countdown})`;
        
        if (countdown <= 0) {
            goNext();
        }
    }, 1000);
}

init();