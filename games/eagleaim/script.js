import { OrkaCloud } from '../../core/scripts/orka-cloud.js';
import { OrkaFX, OrkaMath, OrkaDate, OrkaStorage, OrkaAudio, OrkaCalendar, Utils } from '../../core/scripts/orka-lib.js';

// =========================
// CONFIGURAÇÕES
// =========================
const GAME_ID = 'eagle_aim';
const MIN_DATE = '2026-01-01'; // Data de lançamento
const PENALTY_MS = 1000; 
const PERFECT_BONUS_MS = 500;
const TOTAL_WAVES = 3;

let state = {
    currentDate: new Date(),
    seed: 0,
    isPlaying: false,
    waveIndex: 0,
    targetsLeft: 0,
    startTime: 0,
    penaltyTime: 0,
    bonusTime: 0,
    timerInterval: null,
    levelData: null,
    finalTime: 0,
    bestTime: null,
    calendarViewDate: new Date()
};

const screens = {
    menu: document.getElementById('screen-menu'),
    countdown: document.getElementById('screen-countdown'),
    game: document.getElementById('screen-game')
};

const els = {
    timer: document.getElementById('timer-hud'),
    wave: document.getElementById('wave-hud'),
    targets: document.getElementById('targets-container'),
    missLayer: document.getElementById('miss-click-layer'),
    splatLayer: document.getElementById('splat-layer'),
    countText: document.getElementById('countdown-text'),
    dateDisplay: document.getElementById('date-display'),
    scoreDisplay: document.getElementById('last-score-display'),
    dailyBestContainer: document.getElementById('daily-best-container'),
    dailyBestValue: document.querySelector('.best-score-display'),
    finalScore: document.querySelector('.big-score'),
    btnPlay: document.getElementById('btn-play'),
    // Ranking elements
    btnRanking: document.getElementById('btn-ranking'),
    rankingList: document.getElementById('ranking-list'),
    rankingDate: document.getElementById('ranking-date-title'),
    modalRanking: document.getElementById('modal-ranking'),
    modalNick: document.getElementById('modal-nick'),
    nickInput: document.getElementById('nick-input'),
    saveNickBtn: document.getElementById('save-nick-btn')
};

const I18N = {
    'pt-BR': {
        play: 'JOGAR',
        play_again: 'JOGAR NOVAMENTE',
        ranking_btn: '🏆 RANKING',
        loading: 'Carregando...',
        wave: 'ONDA',
        aim: 'AIM!',
        ready_title: 'PRONTO?',
        best_today: 'MELHOR TEMPO DE HOJE',
        sending: '🚀 Enviando score...',
        loading_rank: 'Carregando ranking...',
        be_first: 'Seja o primeiro a pontuar hoje!',
        modal_nick_title: 'COMO DEVEMOS TE CHAMAR?',
        save_btn: 'SALVAR E ENTRAR',
        back_home: 'Voltar ao Hub',
        perfect: 'PERFECT!',
        error: 'ERRO!',
        penalty: 'PENALIDADE!',
        rotate: 'POR FAVOR, VIRE SEU DISPOSITIVO',
        rotate_sub: 'Este jogo requer a tela na horizontal'
    },
    'en-US': {
        play: 'PLAY',
        play_again: 'PLAY AGAIN',
        ranking_btn: '🏆 LEADERBOARD',
        loading: 'Loading...',
        wave: 'WAVE',
        aim: 'AIM!',
        ready_title: 'READY?',
        best_today: 'TODAY\'S BEST',
        sending: '🚀 Submitting score...',
        loading_rank: 'Loading leaderboard...',
        be_first: 'Be the first to score today!',
        modal_nick_title: 'WHAT SHOULD WE CALL YOU?',
        save_btn: 'SAVE AND ENTER',
        back_home: 'Back to Hub',
        perfect: 'PERFECT!',
        error: 'MISS!',
        penalty: 'PENALTY!',
        rotate: 'PLEASE ROTATE DEVICE',
        rotate_sub: 'This game requires landscape mode'
    }
};

let currentLang = 'pt-BR'; // Padrão
let T = I18N['pt-BR']; // Atalho para os textos atuais

// =========================
// 1. INICIALIZAÇÃO
// =========================
async function init() {
    await OrkaCloud.init();
    state.currentDate.setHours(0,0,0,0);
    state.calendarViewDate = new Date(state.currentDate); 
    updateDateDisplay();
    
    // 🔊 CARREGAMENTO DOS SONS
    OrkaAudio.load({
        'shoot': '../../assets/sounds/shoot.mp3',   // Som mecânico de gatilho/disparo leve
        //'hit': '../../assets/sounds/table-smash.mp3',   // Um "POP" ou vidro quebrando satisfatório
        'miss': '../../assets/sounds/glass-shrink.mp3',    // Um "Buzz" ou som grave
        'aim': '../../assets/sounds/eagle.mp3', // Som de impacto ou "Carregar arma"
        'wave': '../../assets/sounds/recharge.mp3', // Um whoosh de vento
        'endgame': '../../assets/sounds/last-impact.mp3', // Fim das ondas
        'record': '../../assets/sounds/crowd-applause.mp3', // Pequena vinheta de vitória
        'precise': '../../assets/sounds/shine.mp3', //Perfect hit
        'tick': '../../assets/sounds/beep.mp3',
        'hit_armor': '../../assets/sounds/hit-armor.mp3'
    });

    loadDailyRecord();

    els.btnPlay.addEventListener('click', () => {
        // DETECÇÃO DE MOBILE (Simples e eficaz)
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Só pede fullscreen se for celular
        if (isMobile) {
            requestFullScreen(); 
        }
        startCountdown();
    });
        
    // Miss Click (Fundo transparente)
    els.missLayer.addEventListener('mousedown', (e) => handleMissClick(e));
    els.missLayer.addEventListener('touchstart', (e) => { e.preventDefault(); handleMissClick(e.touches[0]); });
    //Compartilhar resultado
    els.btnShare = document.getElementById('btn-share');
    els.btnShare.addEventListener('click', shareResult);
    
    // 🔊 SOM DE TIRO GENÉRICO (Ao clicar em qualquer lugar do stage)
    document.getElementById('game-stage').addEventListener('mousedown', () => {
        if(state.isPlaying) OrkaAudio.play('shoot', 0.3);
    });

    // Listeners de Ranking
    els.btnRanking.addEventListener('click', handleRankingClick);
    els.saveNickBtn.addEventListener('click', saveNicknameAndSubmit);

    setupCalendarButtons();
}

// =========================
// 2. STORAGE E DATA
// =========================
function getStorageKey() {
    const iso = state.currentDate.toISOString().split('T')[0];
    return `eagleAim_record_${iso}`;
}

function loadDailyRecord() {
    const record = OrkaStorage.load(getStorageKey());
    if (record) {
        state.bestTime = parseFloat(record);
        els.dailyBestValue.textContent = state.bestTime.toFixed(3) + 's';
        els.dailyBestContainer.style.display = 'block';
        els.btnPlay.innerHTML = 'JOGAR NOVAMENTE <span class="material-icons" style="font-size: 1.1em; vertical-align: bottom; margin-left:5px;">movie</span>';
    } else {
        state.bestTime = null;
        els.dailyBestContainer.style.display = 'none';
        els.btnPlay.textContent = "JOGAR";
    }
}

function saveDailyRecord(newTime) {
    const timeFloat = parseFloat(newTime);
    if (!state.bestTime || timeFloat < state.bestTime) {
        state.bestTime = timeFloat;
        OrkaStorage.save(getStorageKey(), timeFloat);
        
        OrkaFX.confetti(); 
        OrkaAudio.play('record'); // 🔊 SOM DE RECORDE
    }
}

function updateDateDisplay() {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    els.dateDisplay.textContent = state.currentDate.toLocaleDateString('pt-BR', options).toUpperCase();
}

// =========================
// 3. LÓGICA DO JOGO
// =========================

function generateDailyLevel(dateInput) {
    const seed = OrkaMath.getDateSeed(dateInput);
    const rng = OrkaMath.createSeededRNG(seed);
    const level = { waves: [] };

    for (let w = 0; w < TOTAL_WAVES; w++) {
        const wave = { targets: [] };
        const count = 3 + (2 * w) + Math.floor(rng() * 1.5); 

        for (let i = 0; i < count; i++) {
            // Definição do Tipo (Baseado na dificuldade/onda)
            // Onda 0: 100% normal
            // Onda 1: 20% movel
            // Onda 2: 30% movel, 10% blindado
            let type = 'normal';
            const roll = rng();
            
            if (w > 0 && roll > 0.7) type = 'moving';
            if (w > 1 && roll > 0.7) type = 'armored';

            // Configuração de Movimento (se for móvel)
            let moveConfig = null;
            if (type === 'moving') {
                moveConfig = {
                    axis: rng() > 0.5 ? 'X' : 'Y', // Horizontal ou Vertical
                    speed: 2 + (rng() * 2) + 's', // 2s a 4s
                    range: 20 + (rng() * 30) // Amplitude do movimento em %
                };
            }

            wave.targets.push({
                id: `w${w}-t${i}`,
                x: 15 + (rng() * 70), // Margem segura
                y: 15 + (rng() * 70),
                scale: 0.9 + (rng() * 0.3),
                type: type,      // 'normal', 'moving', 'armored'
                move: moveConfig // null ou objeto
            });
        }
        level.waves.push(wave);
    }
    return level;
}

function startCountdown() {
    switchScreen('countdown');
    OrkaCloud.startSession(GAME_ID);
    state.levelData = generateDailyLevel(state.currentDate);
    els.splatLayer.innerHTML = ''; // Limpa manchas
    
    let count = 3;
    els.countText.textContent = count;
    els.countText.style.color = '#facc15';
    OrkaAudio.play('tick'); // <--- Toca no "3"
    
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            els.countText.textContent = count;
            els.countText.style.transform = 'scale(1.5)';
            OrkaAudio.play('tick'); // <--- Toca no "1 e 2"
            setTimeout(() => els.countText.style.transform = 'scale(1)', 100);
        } else if (count === 0) {
            els.countText.textContent = "AIM!";
            els.countText.style.color = '#ffffff';
            document.body.classList.add('game-mode');
            
            OrkaAudio.play('aim'); // 🔊 SOM "AIM!"
            
        } else {
            clearInterval(interval);
            startGame();
        }
    }, 700);
}

function startGame() {
    switchScreen('game');
    state.isPlaying = true;
    state.waveIndex = 0;
    state.penaltyTime = 0;
    state.bonusTime = 0;
    state.startTime = performance.now();
    
    spawnWave(0);
    state.timerInterval = requestAnimationFrame(updateTimerLoop);
}

function updateTimerLoop() {
    if (!state.isPlaying) return;
    const now = performance.now();
    const current = Math.max(0, now - state.startTime + state.penaltyTime - state.bonusTime);
    els.timer.textContent = (current / 1000).toFixed(2);
    requestAnimationFrame(updateTimerLoop);
}

function spawnWave(index) {
    if (index >= TOTAL_WAVES) {
        finishGame();
        return;
    }
    state.waveIndex = index;
    els.wave.textContent = `ONDA ${index + 1}/${TOTAL_WAVES}`;
    els.targets.innerHTML = ''; 
    
    OrkaAudio.play('wave'); // 🔊 SOM DE GATILHO
    
    const waveData = state.levelData.waves[index];
    state.targetsLeft = waveData.targets.length;

    waveData.targets.forEach((t, i) => {
        const el = document.createElement('div');
        el.className = 'target';
        
        // Aplica Classes Especiais
        if (t.type === 'armored') {
            el.classList.add('armored');
            el.dataset.hp = 2; // Vida extra
        }
        
        if (t.type === 'moving') {
            el.classList.add('moving');
            // Lógica Determinística de Movimento via CSS Var
            // Precisamos ajustar o keyframe dinamicamente ou usar valores fixos
            // Simplificação: Vamos usar style inline para animar
            const animName = t.move.axis === 'X' ? 'moveHorizontal' : 'moveVertical';
            el.style.animationName = animName;
            el.style.animationDuration = t.move.speed;
        }

        // Posicionamento
        el.style.left = t.x + '%';
        el.style.top = t.y + '%';
        el.style.transform = `translate(-50%, -50%) scale(0)`; // Estado inicial
        
        // Efeito de entrada escalonado
        setTimeout(() => {
            if(state.isPlaying) el.style.transform = `translate(-50%, -50%) scale(${t.scale})`;
        }, i * 50);

        const hitHandler = (e) => {
            const clientX = e.clientX || e.changedTouches[0].clientX;
            const clientY = e.clientY || e.changedTouches[0].clientY;

            e.preventDefault(); 
            e.stopPropagation(); // Impede miss click
            if (!state.isPlaying) return;
            
            OrkaAudio.play('shoot'); // 🔊 SOM DE TIRO
            createVisualFX(clientX, clientY, true);

            // Lógica Perfect Shot
            const rect = el.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dist = Math.hypot(clientX - centerX, clientY - centerY);
            const isPerfect = dist < (rect.width / 2) * 0.25;
            
            if (dist < (rect.width / 2) * 0.25) { 
                state.bonusTime += PERFECT_BONUS_MS;
                OrkaFX.toast(`PERFECT! -${(PERFECT_BONUS_MS/1000)}s`, 'success');
                OrkaAudio.play('precise');
                
                // Flash Verde
                const flash = document.createElement('div');
                flash.className = 'perfect-flash';
                document.body.appendChild(flash);
                setTimeout(() => flash.remove(), 200);
            }

            // LÓGICA DE VIDA (BLINDADO)
            // Se for blindado, tem HP > 1 E NÃO foi perfect shot
            if (t.type === 'armored' && parseInt(el.dataset.hp) > 1 && !isPerfect) {
                // Apenas danifica
                el.dataset.hp = 1;
                el.classList.remove('armored'); // Vira vermelho (normal)
                el.style.transform = `translate(-50%, -50%) scale(${t.scale * 0.8})`; // Encolhe um pouco com impacto
                
                OrkaAudio.play('hit_armor'); // (Sugestão: som metálico)
                createVisualFX(clientX, clientY, false); // Splat azul/diferente?
                return; // NÃO DESTRÓI AINDA!
            }

            // Se chegou aqui: Destrói
            createVisualFX(clientX, clientY, true);
            el.remove();
            
            state.targetsLeft--;
            if (state.targetsLeft <= 0) {
                setTimeout(() => spawnWave(state.waveIndex + 1), 100);
            }
        };

        el.addEventListener('mousedown', hitHandler);
        el.addEventListener('touchstart', hitHandler);
        els.targets.appendChild(el);
    });
}

// Listener do Botão Voltar
    document.getElementById('btn-back-hub').addEventListener('click', () => {
        // Sai do Fullscreen se estiver (opcional, navegadores fazem auto)
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        // Redireciona
        window.location.href = '../../index.html';
    });

function handleMissClick(e) {
    if (!state.isPlaying) return;
    
    // Tenta pegar coordenadas para o splat (se houver)
    const clientX = e.clientX || e.changedTouches?.[0]?.clientX;
    const clientY = e.clientY || e.changedTouches?.[0]?.clientY;
    
    OrkaAudio.play('miss'); // 🔊 SOM DE ERRO
    state.penaltyTime += PENALTY_MS;
    
    OrkaFX.shake('game-wrapper');
    OrkaFX.toast('+1s ERRO!', 'error');
    
    const flash = document.createElement('div');
    flash.className = 'penalty-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 150);
}

function createVisualFX(x, y, isHit) {
    // 1. Mancha
    const splat = document.createElement('div');
    const type = 1 + Math.floor(Math.random() * 3);
    splat.className = `splat splat-type-${type}`;
    splat.style.left = x + 'px'; splat.style.top = y + 'px';
    splat.style.transform = `translate(-50%, -50%) rotate(${Math.random()*360}deg)`;
    els.splatLayer.appendChild(splat);

    // 2. Respingos
    const dropletsCount = 4 + Math.floor(Math.random() * 3);
    for(let i=0; i<dropletsCount; i++) {
        const drop = document.createElement('div');
        drop.className = 'splat-droplet';
        const angle = Math.random() * Math.PI * 2;
        const distance = 15 + Math.random() * 25; 
        const size = 4 + Math.random() * 6;
        drop.style.width = size + 'px'; drop.style.height = size + 'px';
        drop.style.left = (x + (Math.cos(angle) * distance)) + 'px';
        drop.style.top = (y + (Math.sin(angle) * distance)) + 'px';
        els.splatLayer.appendChild(drop);
    }
    
    // 3. Ripple
    const ripple = document.createElement('div');
    ripple.className = 'touch-ripple';
    ripple.style.left = x + 'px'; ripple.style.top = y + 'px';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
}

function finishGame() {
    state.isPlaying = false;
    cancelAnimationFrame(state.timerInterval);
    document.body.classList.remove('game-mode');
    
    const now = performance.now();
    const rawTime = Math.max(0, now - state.startTime + state.penaltyTime - state.bonusTime);
    state.finalTime = (rawTime / 1000).toFixed(3);
    
    saveDailyRecord(state.finalTime);
    loadDailyRecord(); 
    
    OrkaCloud.endSession({
        score: state.finalTime,
        wave: TOTAL_WAVES,
        perfect_bonus: state.bonusTime
    });
    
    els.finalScore.textContent = state.finalTime + 's';
    els.scoreDisplay.style.display = 'block';
    
    // Atualiza botão com ícone de anúncio
    els.btnPlay.innerHTML = 'JOGAR NOVAMENTE <span class="material-icons" style="font-size: 1.1em; vertical-align: bottom; margin-left:5px;">movie</span>';
    OrkaAudio.play('endgame');

    switchScreen('menu');
}

function switchScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// =========================
// 4. CALENDÁRIO OTIMIZADO
// =========================
function setupCalendarButtons() {
    const btn = document.getElementById('calendar-btn');
    const modal = document.getElementById('modal-calendar');
    
    btn.addEventListener('click', () => {
        state.calendarViewDate = new Date(state.currentDate);
        refreshCalendarUI();
        modal.classList.add('active');
    });

    document.getElementById('prev-month').addEventListener('click', () => {
        state.calendarViewDate.setMonth(state.calendarViewDate.getMonth() - 1);
        refreshCalendarUI();
    });
    document.getElementById('next-month').addEventListener('click', () => {
        state.calendarViewDate.setMonth(state.calendarViewDate.getMonth() + 1);
        refreshCalendarUI();
    });
}

function refreshCalendarUI() {
    OrkaCalendar.render('calendar-grid', 'calendar-month-year', state.calendarViewDate, {
        minDate: MIN_DATE,
        onClick: (selectedDate) => {
            state.currentDate = selectedDate;
            updateDateDisplay();
            loadDailyRecord();
            els.scoreDisplay.style.display = 'none';
            document.getElementById('modal-calendar').classList.remove('active');
        },
        getDayClass: (isoDate) => {
            let classes = [];
            if (isoDate === state.currentDate.toISOString().split('T')[0]) {
                classes.push('active-date');
            }
            if (OrkaStorage.load(`eagleAim_record_${isoDate}`)) {
                classes.push('win');
            }
            return classes.join(' ');
        }
    });
}

// =========================
// 5. RANKING
// =========================
async function handleRankingClick() {
    const currentNick = OrkaCloud.getNickname();
    if (!currentNick) {
        els.modalNick.classList.add('active');
        els.nickInput.focus();
    } else {
        await submitAndOpenRanking();
    }
}

async function saveNicknameAndSubmit() {
    const name = els.nickInput.value.trim();
    if (!name) return OrkaFX.shake('modal-nick');
    await OrkaCloud.updateNickname(name);
    els.modalNick.classList.remove('active');
    await submitAndOpenRanking();
}

async function submitAndOpenRanking() {
    els.modalRanking.classList.add('active');
    els.rankingList.innerHTML = '<div style="padding:20px; text-align:center;">🚀 Enviando score...</div>';
    
    if (state.bestTime) {
        await OrkaCloud.submitScore(GAME_ID, state.bestTime, state.currentDate);
    }
    await loadLeaderboardUI();
}

async function loadLeaderboardUI() {
    // Formata data localmente dependendo da língua
    const dateOptions = { weekday: 'long', day: 'numeric', month: 'long' };
    els.rankingDate.textContent = state.currentDate.toLocaleDateString(currentLang, dateOptions);
    
    els.rankingList.innerHTML = `<div style="padding:20px; text-align:center;">${T.loading_rank}</div>`;
    
    const data = await OrkaCloud.getLeaderboard(GAME_ID, state.currentDate);
    
    els.rankingList.innerHTML = ''; 
    if (data.length === 0) {
        els.rankingList.innerHTML = `<div style="padding:20px; text-align:center; color:#666;">${T.be_first}</div>`;
        return;
    }

    data.forEach((entry, index) => {
        const div = document.createElement('div');
        div.className = `ranking-row ${entry.isMe ? 'is-me' : ''}`;
        
        // Renderiza Avatar + Nome + Score
        div.innerHTML = `
            <div class="rank-left">
                <span class="rank-pos">#${index + 1}</span>
                <img src="${entry.avatar}" alt="Avatar" class="rank-avatar" onerror="this.src='../../assets/icons/orka-logo.png'">
                <span class="rank-name">${entry.nickname}</span>
            </div>
            <span class="rank-score">${entry.score.toFixed(3)}s</span>
        `;
        els.rankingList.appendChild(div);
    });
}

function requestFullScreen() {
    const doc = window.document;
    const docEl = doc.documentElement;

    const request = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
    
    if (request && !doc.fullscreenElement) {
        // Tenta entrar em fullscreen (pode falhar se o usuário negar, mas tentamos)
        request.call(docEl).catch(err => console.log("Fullscreen bloqueado ou cancelado"));
    }
}

async function shareResult() {
    const dateStr = state.currentDate.toLocaleDateString('pt-BR');
    const text = `🦅 EAGLE AIM | ${dateStr}\n⏱️ Tempo: ${state.finalTime}s\n\nConsegue me superar?\nJogue em: orka-hub.vercel.app/games/eagleaim/`;
    
    try {
        await navigator.clipboard.writeText(text);
        OrkaFX.toast('Copiado para área de transferência!', 'success');
    } catch (err) {
        OrkaFX.toast('Erro ao copiar', 'error');
    }
}

init();