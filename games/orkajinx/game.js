import { OrkaCloud, supabase } from '../../core/scripts/orka-cloud.js';
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
    round: 1,
    players: [] 
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

// --- INICIALIZAÇÃO ---
async function init() {
    // Configura botões de idioma
    setupLanguageButtons();
    
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
        inputs.roomCode.value = code;
        joinRoom(code);
    }
}

// --- AUTOCOMPLETE (ORKA ZOO STYLE) ---
inputs.word.addEventListener('input', () => {
    const val = inputs.word.value.trim().toUpperCase();
    
    // Limpa sugestões se vazio
    if (val.length < 1) {
        suggestionsBox.style.display = 'none';
        return;
    }

    // Filtra palavras do dicionário que começam com o input
    // Limitamos a 5 sugestões para não poluir a tela
    const matches = state.dictionary
        .filter(w => w.startsWith(val))
        .slice(0, 5); 

    renderSuggestions(matches);
});

function renderSuggestions(matches) {
    if (matches.length === 0) {
        suggestionsBox.style.display = 'none';
        return;
    }

    suggestionsBox.innerHTML = '';
    matches.forEach(word => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = word;
        
        // Ao clicar na sugestão
        div.onclick = () => {
            inputs.word.value = word;
            suggestionsBox.style.display = 'none';
            inputs.word.focus();
        };
        
        suggestionsBox.appendChild(div);
    });
    
    suggestionsBox.style.display = 'block';
}

// Fechar sugestões ao clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('#suggestions-box') && !e.target.closest('#word-input')) {
        suggestionsBox.style.display = 'none';
    }
});

// --- LÓGICA DE SALA ---

document.getElementById('btn-create').addEventListener('click', async () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    const { data, error } = await supabase
        .from('jinx_rooms')
        .insert({ 
            code: code, 
            language: state.language,
            status: 'waiting'
        })
        .select()
        .single();

    if (error) return alert('Erro ao criar sala.');

    state.isHost = true;
    enterRoom(data);
});

document.getElementById('btn-join').addEventListener('click', () => {
    const code = inputs.roomCode.value.toUpperCase();
    if (code.length < 4) return;
    joinRoom(code);
});

async function joinRoom(code) {
    const { data, error } = await supabase
        .from('jinx_rooms')
        .select('*')
        .eq('code', code)
        .single();

    if (error || !data) return alert('Sala não encontrada.');
    
    enterRoom(data);
}

async function enterRoom(roomData) {
    state.roomId = roomData.id;
    state.roomCode = roomData.code;
    
    // Define o idioma baseado na sala (não na escolha local anterior)
    setLang(roomData.language); 
    
    // Se o jogador já estiver na sala (ex: reload), não insere de novo
    // Mas para simplificar "Multiplayer Simples", tentamos inserir e ignoramos erro
    await supabase.from('jinx_room_players').upsert({
        room_id: state.roomId,
        player_id: state.playerId,
        nickname: state.nickname
    }, { onConflict: 'player_id, room_id' }); // Garante que não duplica

    document.getElementById('display-code').innerText = state.roomCode;
    showScreen(roomData.status === 'playing' ? 'game' : 'waiting');
    
    subscribeToRoom();
}

// --- REALTIME ---

function subscribeToRoom() {
    const channel = supabase.channel(`room:${state.roomId}`);

    channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'jinx_room_players', filter: `room_id=eq.${state.roomId}` }, handlePlayerChange)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jinx_rooms', filter: `id=eq.${state.roomId}` }, handleRoomChange)
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') fetchPlayers();
        });
}

async function fetchPlayers() {
    const { data } = await supabase.from('jinx_room_players').select('*').eq('room_id', state.roomId);
    state.players = data;
    renderPlayers();
    checkMyStatus(); // <--- CORREÇÃO: Verifica se devo destravar o input
}

function handlePlayerChange(payload) {
    if (payload.eventType === 'INSERT') {
        state.players.push(payload.new);
    } else if (payload.eventType === 'UPDATE') {
        const index = state.players.findIndex(p => p.id === payload.new.id);
        if (index !== -1) state.players[index] = payload.new;
    } else if (payload.eventType === 'DELETE') {
        state.players = state.players.filter(p => p.id !== payload.old.id);
    }
    renderPlayers();
    checkMyStatus(); // <--- IMPORTANTE: Verifica meu estado a cada mudança
    checkGameLogic(); // Host verifica fim de turno
}

function handleRoomChange(payload) {
    if (payload.new.status === 'playing') showScreen('game');
    if (payload.new.status === 'finished') endGame(true);
}

// --- CORREÇÃO DO BUG DO INPUT ---
function checkMyStatus() {
    const myPlayer = state.players.find(p => p.player_id === state.playerId);
    
    if (myPlayer) {
        // Se eu NÃO estou pronto (is_ready: false), meu input deve estar liberado!
        if (!myPlayer.is_ready) {
            if (inputs.word.disabled) {
                inputs.word.disabled = false;
                inputs.word.value = ''; // Limpa input anterior
                inputs.word.focus();
                
                // Animação visual de nova rodada
                document.getElementById('status-text').innerText = "NOVA TENTATIVA...";
                setTimeout(() => document.getElementById('status-text').innerText = "SINCRONIA MENTAL", 1500);
            }
        } else {
            // Se estou pronto, input travado
            inputs.word.disabled = true;
        }
    }
}

// --- RENDERIZAÇÃO ---
function renderPlayers() {
    // Lista de espera
    const waitingList = document.getElementById('waiting-list');
    if (waitingList) {
        waitingList.innerHTML = state.players.map(p => `
            <div style="background:#111; padding:10px; border-radius:4px; display:inline-block; margin:5px;">
                ${p.nickname}
            </div>
        `).join('');
        
        const btnStart = document.getElementById('btn-start');
        if (state.isHost && state.players.length >= 2) btnStart.disabled = false;
        else btnStart.disabled = true;
    }

    // Grid do Jogo
    const grid = document.getElementById('players-grid');
    if (grid) {
        grid.innerHTML = '';
        
        // Verifica se todos estão prontos (Fase de Revelação)
        const allReady = state.players.length > 0 && state.players.every(pl => pl.is_ready);

        state.players.forEach(p => {
            const isMe = p.player_id === state.playerId;
            const isReady = p.is_ready;
            
            let displayWord = '...';
            let cardClass = 'player-card';

            if (isReady) {
                cardClass += ' ready';
                if (!allReady) displayWord = 'PRONTO'; // Esconde a palavra por enquanto
            }
            
            // REVELAÇÃO: Se todos prontos, mostra a palavra
            if (allReady) {
                displayWord = p.current_word || '';
                cardClass += ' revealed';
            }

            const html = `
                <div class="${cardClass}">
                    <div class="player-avatar">
                         <span class="material-icons" style="color:#666; font-size:32px;">
                            ${isReady ? 'check_circle' : 'person'}
                         </span>
                    </div>
                    <div class="player-nick" style="color:${isMe ? 'var(--orka-accent)' : '#888'}">
                        ${p.nickname}
                    </div>
                    <div class="player-word-display">${displayWord}</div>
                </div>
            `;
            grid.innerHTML += html;
        });
    }
}

// --- LOGICA DO HOST ---
async function checkGameLogic() {
    if (!state.isHost) return;
    
    // Evita loop se não tiver ninguém
    if (state.players.length === 0) return;

    const allReady = state.players.every(p => p.is_ready);
    
    // Se todos prontos, verifica vitória
    if (allReady) {
        // Delay para o pessoal ler as palavras (3 segundos)
        setTimeout(async () => {
            // Re-verifica estado atual (para evitar race condition)
            const { data: currentPlayers } = await supabase.from('jinx_room_players').select('*').eq('room_id', state.roomId);
            if (!currentPlayers) return;

            const words = currentPlayers.map(p => p.current_word);
            const firstWord = words[0];
            const allMatch = words.every(w => w === firstWord);

            if (allMatch) {
                finishGame();
            } else {
                resetRound(); // Isso vai setar is_ready=false no DB -> dispara handlePlayerChange -> chama checkMyStatus() nos clientes
            }
        }, 3000);
    }
}

async function resetRound() {
    state.round++;
    document.getElementById('round-counter').innerText = `RODADA ${state.round}`;
    
    // Reseta todos os players no banco
    await supabase
        .from('jinx_room_players')
        .update({ is_ready: false, current_word: '' })
        .eq('room_id', state.roomId);
}

// --- ENVIO DA PALAVRA ---
async function sendWord() {
    const word = inputs.word.value.trim().toUpperCase();
    
    if (!state.dictionary.includes(word)) {
        // Feedback visual de erro
        inputs.word.style.borderColor = 'var(--status-wrong)';
        setTimeout(() => inputs.word.style.borderColor = '#333', 500);
        return;
    }

    inputs.word.disabled = true; // Trava localmente
    suggestionsBox.style.display = 'none';

    await supabase
        .from('jinx_room_players')
        .update({ is_ready: true, current_word: word })
        .eq('player_id', state.playerId)
        .eq('room_id', state.roomId);
}

// Eventos de Envio
inputs.word.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendWord();
});
document.getElementById('btn-send-word').addEventListener('click', sendWord);

// --- UTILITÁRIOS ---
function showScreen(name) {
    Object.values(screens).forEach(s => s.style.display = 'none');
    screens[name].style.display = 'flex';
}

function setupLanguageButtons() {
    const btnPt = document.getElementById('btn-lang-pt');
    const btnEn = document.getElementById('btn-lang-en');
    
    btnPt.onclick = () => setLang('pt-BR');
    btnEn.onclick = () => setLang('en-US');
}

function setLang(lang) {
    state.language = lang;
    state.dictionary = (lang === 'en-US') ? palavrasEN : palavrasPT;
    
    const btnPt = document.getElementById('btn-lang-pt');
    const btnEn = document.getElementById('btn-lang-en');
    
    if(lang === 'pt-BR') {
        btnPt.classList.add('orka-btn-primary'); btnPt.style.background = 'var(--orka-accent)'; btnPt.style.color = 'white';
        btnEn.classList.remove('orka-btn-primary'); btnEn.style.background = '#222'; btnEn.style.color = '#888';
    } else {
        btnEn.classList.add('orka-btn-primary'); btnEn.style.background = 'var(--orka-accent)'; btnEn.style.color = 'white';
        btnPt.classList.remove('orka-btn-primary'); btnPt.style.background = '#222'; btnPt.style.color = '#888';
    }
}

// Start
document.getElementById('btn-start').addEventListener('click', async () => {
    await supabase.from('jinx_rooms').update({ status: 'playing' }).eq('id', state.roomId);
});

async function finishGame() {
    await supabase.from('jinx_rooms').update({ status: 'finished' }).eq('id', state.roomId);
    
    // Limpeza posterior
    setTimeout(async () => {
        await supabase.from('jinx_rooms').delete().eq('id', state.roomId);
    }, 5000);
}

function endGame(win) {
    document.getElementById('status-text').innerText = "SINCRONIA PERFEITA!";
    document.getElementById('status-text').style.color = "var(--status-correct)";
    setTimeout(() => {
        alert("Vitória! Jinx!");
        window.location.href = '../../index.html';
    }, 2000);
}

init();