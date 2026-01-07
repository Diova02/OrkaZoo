import animalsDB from './animais.js';
import curiositiesDB from './curiosidades.js';
import { OrkaFX, OrkaDate, OrkaStorage, Utils } from './core/orka-lib.js';

// ==========================================
// CONFIGURAÇÃO
// ==========================================
const MAX_ATTEMPTS = 10;
const START_DATE = new Date("2025-12-01T00:00:00");
const popScale = ["Extinto","Dezenas", "Centenas", "Milhares", "Milhões", "Bilhões", "Trilhões"];

const translations = {
    pt: {
        attempts: "Tentativas", guess: "Chutar", animal: "Animal", weight: "Peso", diet: "Dieta", habitat: "Habitat", continent: "Continente", class: "Classe", pop: "Pop.",
        // TUTORIAL RECEPTIVO ATUALIZADO
        howToPlay: "BEM-VINDO AO ORKA ZOO!", 
        tut1: "Seu objetivo é descobrir o animal secreto do dia em 10 tentativas.",
        tut2: "🟩 VERDE: Atributo exato.\n🟨 AMARELO: Parcialmente correto.",
        tut3: "Setas (↑ ↓) indicam se o peso ou população é maior ou menor.",
        tut4: "Teste seus conhecimentos de zoologia e divirta-se!",
        start: "COMEÇAR DESAFIO", close: "FECHAR",
        // FIM TUTORIAL
        winTitle: "VITÓRIA!", loseTitle: "FIM DE JOGO", winMsg: "Você descobriu o animal!", loseMsg: "Acabaram as tentativas.",
        animalFound: "Você acertou <strong>{animal}</strong> em {attempts} tentativa(s).", animalReveal: "O animal era <strong>{animal}</strong>.",
        toastErrList: "Animal não encontrado!", toastErrDup: "Você já tentou esse animal!", toastWin: "Parabéns! Você venceu!", toastLose: "Fim de jogo!",
        global: "Global", tomorrow: "Volte amanhã para novos desafios!",
        share: "COMPARTILHAR", shareMsg: "Resultado copiado!",
        startMsg: "Tudo começa com um chute...",
        startSub: "Digite um animal para começar!",
        time: "Tempo",
        tipTitle: "CURIOSIDADE DO DIA",
        tipBtn: "LEGAL",
        didYouKnow: "Você sabia? " // Espaço no final intencional
    },
    en: {
        attempts: "Attempts", guess: "Guess", animal: "Animal", weight: "Weight", diet: "Diet", habitat: "Habitat", continent: "Continent", class: "Class", pop: "Pop.",
        howToPlay: "WELCOME TO ORKA ZOO!", 
        tut1: "Your goal is to find the secret animal of the day in 10 attempts.",
        tut2: "🟩 GREEN: Exact match.\n🟨 YELLOW: Partial match.",
        tut3: "Arrows (↑ ↓) indicate higher or lower values.",
        tut4: "Test your zoology skills and have fun!",
        start: "START CHALLENGE", close: "CLOSE",
        winTitle: "VICTORY!", loseTitle: "GAME OVER", winMsg: "You found the animal!", loseMsg: "Out of attempts.",
        animalFound: "You guessed <strong>{animal}</strong> in {attempts} attempt(s).", animalReveal: "The animal was <strong>{animal}</strong>.",
        toastErrList: "Animal not found!", toastErrDup: "Already guessed that!", toastWin: "Congrats! You won!", toastLose: "Game Over!",
        global: "Global", tomorrow: "Come back tomorrow for new challenges!",
        share: "SHARE", shareMsg: "Copied to clipboard!",
        startMsg: "It all starts with a guess...",
        startSub: "Type an animal to start!",
        time: "Time",
        tipTitle: "CURIOSITY OF THE DAY",
        tipBtn: "COOL",
        didYouKnow: "Did you know? " // Espaço no final intencional
    }
};

// Mapa para tradução INGLÊS
const enMap = {
    "Mamifero": "Mammal", "Ave": "Bird", "Reptil": "Reptile", "Anfibio": "Amphibian", "Peixe": "Fish", "Inseto": "Insect", "Aracnideo": "Arachnid", "Molusco": "Mollusk", "Crustaceo": "Crustacean",
    "terrestre": "Terrestrial", "aquatico": "Aquatic", "aereo": "Aerial",
    "Carnivoro": "Carnivore", "Herbivoro": "Herbivore", "Onivoro": "Omnivore", "Insetivoro": "Insectivore", "Piscivoro": "Piscivore", "Nectarivoro": "Nectarivore", "Hematofago": "Hematophage",
    "Africa": "Africa", "Asia": "Asia", "Europa": "Europe", "America": "Americas", "Oceania": "Oceania", "Antartida": "Antarctica",
    "Extinto": "Extinct",
    "Anelideo": "Annelid",
    "Detritivoro": "Detritivore", "Filtrador":"Filter Feeder", "Hematofago":"Hematophagous",
    "Porifero":"Porifera",
    "Tardigrado":"Tardigrade",
    "Cnidario":"Cnidaria",
    "Equinodermo":"Echinodermata"
};

// Mapa para correção PORTUGUÊS (Acentos e Maiúsculas)
const ptCorrections = {
    "terrestre": "Terrestre", "aquatico": "Aquático", "aereo": "Aéreo",
    "America": "América", "Africa": "África", "Asia": "Ásia", "Antartida": "Antártida", "Oceania": "Oceania", "Europa": "Europa",
    "Mamifero": "Mamífero", "Reptil": "Réptil", "Anfibio": "Anfíbio", "Aracnideo": "Aracnídeo", "Crustaceo": "Crustáceo",
    "Carnivoro": "Carnívoro", "Herbivoro": "Herbívoro", "Onivoro": "Onívoro", "Insetivoro": "Insetívoro", "Piscivoro": "Piscívoro", 
    "Nectarivoro": "Nectarívoro", "Hematofago": "Hematófago", "Filtrador":"Filtrador",
    "Extinto": "Extinto", // Garante capitalização
    "Anelideo": "Anelídeo", // Nova classe adicionada
    "Detritivoro": "Detritívoro" // Nova dieta adicionada
};

let currentLang = localStorage.getItem('orkaZooLang') || 'pt';
let gameState = { targetAnimal: null, attemptsCount: 0, guessedNames: new Set(), isGameOver: false, currentDate: new Date() };
let currentFocus = -1;
let calendarMonth = new Date();
let startTime = null;
let endTime = null;

// DOM Elements
const input = document.getElementById("guess-input");
const suggestionsBox = document.getElementById("suggestions");
const submitBtn = document.getElementById("submit-btn");
const gridBody = document.getElementById("grid-body");
const attemptDisplay = document.getElementById("attempt-count");
const dateDisplay = document.getElementById("date-display");
const langBtn = document.getElementById("lang-btn");
const summaryBox = document.getElementById("page-end-summary");
const tipBtn = document.getElementById("tip-btn");

// ==========================================
// CONTROLE DE VERSÃO DO BANCO (Anti-Quebra)
// ==========================================
/* COMO USAR:
   Quando você adicionar novos animais no fim do array 'animaisDB', 
   crie um novo marco aqui com a data da atualização e o tamanho ANTERIOR do banco.
   
   Isso "congela" a lógica matemática para os dias passados.
*/
const CHECKPOINTS = [
    // CARO DESENVOLVEDOR: Essa constante previne quebra do banco de dados no futuro. 
    // Caso você decida adicionar novos animais (e você vai querer) 
    // Sempre que o jogo já estiver reaproveitando animais passados, volte nesta constante e adicione:
    // { date: "YYYY-DD-MM", limit: número de entradas ANTES da adição },
    // Isso fará com que um portal temporal se abra e que o histórico seja preservado corretamente.
];

// Dias Especiais (Controle Editorial)
const SPECIAL_DAYS = {//Exemplos:
    //"2024-12-25": "Rena",           // Natal
    //"2024-10-31": "Morcego",        // Halloween
    //"2024-01-01": "Mico Leão Dourado" // Exemplo
};

// ==========================================
// LÓGICA DA CURIOSIDADE DO DIA
// ==========================================
function getDailyTip() {
    const today = new Date();

    const diffTime = Math.abs(today - START_DATE);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    // Usa o curiositiesDB
    if(diffDays < 0) return curiositiesDB[0];
    const index = diffDays % curiositiesDB.length;
    return curiositiesDB[index];
}

// Evento de Clique no Botão (?)
tipBtn.addEventListener("click", () => {
    const tip = getDailyTip();
    const modal = document.getElementById("modal-tip");
    const tipText = document.getElementById("tip-text");
    const tipImg = document.getElementById("tip-img");

    // 1. Inserir Texto (a depender da língua)
    const prefix = t("didYouKnow");
    const content = currentLang === 'pt' ? tip.dica.pt : tip.dica.en;

    tipText.innerHTML = `<strong style="color:var(--accent-color)">${prefix}</strong>${content}`;

    // 2. Carregar Imagem (Reaproveitando a lógica normalizadora)
    // Normaliza o nome da imagem vindo do dicas.js (ex: "Água Viva" -> "aguaviva")
    const normalizedImgName = normalizeStr(tip.img).replace(/\s+/g, "");
    
    // Tenta carregar usando a função que já existe
    tryLoadImage(tipImg, normalizedImgName, ['png', 'jpg', 'jpeg', 'webp', 'svg'], 0);

    modal.classList.add("active");
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
function initGame(dateInput = new Date()) {
    langBtn.textContent = currentLang.toUpperCase();
    applyTranslation(); 
    input.placeholder = currentLang === 'pt' ? "Digite um animal..." : "Type an animal...";

    resetGameUI();
    const gameDate = new Date(dateInput);
    gameDate.setHours(0,0,0,0);
    gameState.currentDate = gameDate;

    updateDateDisplay();
    gameState.targetAnimal = getTargetByDate(gameDate);
    loadProgress();

    if (!localStorage.getItem('orkaZooTutorialV3')) {
        document.getElementById('modal-help').classList.add('active');
        localStorage.setItem('orkaZooTutorialV3', 'true');
    }
}

function getTargetByDate(dateObj) {
    // 1. Verifica Controle Editorial (Exceção)
    const dateKey = dateObj.toISOString().split('T')[0];
    if (SPECIAL_DAYS[dateKey]) {
        const specialName = SPECIAL_DAYS[dateKey];
        const specialAnimal = animalsDB.find(a => a.nome.pt === specialName);
        if (specialAnimal) return specialAnimal;
        console.warn(`Animal especial '${specialName}' não encontrado no DB! Usando fallback.`);
    }

    // 2. Calcula dias passados desde o início (01/01/2024)
    const diffTime = Math.abs(dateObj - START_DATE);
    const dayIndex = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if(dayIndex < 0) return animalsDB[0]; // Proteção

    // 3. Lógica de Marcos Temporais (A MÁGICA ACONTECE AQUI)
    // Verifica se a data consultada é anterior a algum update que fizemos
    let activeDbSize = animalsDB.length;
    let offset = 0;

    for (const check of CHECKPOINTS) {
        const checkDate = new Date(check.date);
        // Se a data do jogo for ANTERIOR ao checkpoint, usamos o limite daquela época
        if (dateObj < checkDate) {
            activeDbSize = check.limit;
            break; 
        }
        // Se passamos por um checkpoint, podemos ajustar o offset se necessário 
        // (mas geralmente só travar o tamanho já resolve o loop)
    }

    // 4. Seleção Matemática Segura
    // O operador % (resto) garante o loop infinito seguro
    const index = dayIndex % activeDbSize;
    
    // Fallback: Se por acaso o índice for maior que o banco atual (bug raro), pega o último
    return animalsDB[index] || animalsDB[animalsDB.length - 1];
}

function resetGameUI() {
    gameState.attemptsCount = 0;
    gameState.guessedNames.clear();
    gameState.isGameOver = false;
    input.value = "";
    input.disabled = false;
    submitBtn.disabled = false;
    gridBody.innerHTML = "";
    summaryBox.style.display = "none";
    attemptDisplay.textContent = "0";
    closeModal('modal-end');
    document.getElementById("empty-state").style.display = "block"; // Mostra msg inicial
    startTime = null;
    endTime = null;
}

// ==========================================
// FORMATAÇÃO E TRADUÇÃO (Correção Bug 4 e 5)
// ==========================================
function formatTerm(val) {
    if (!val) return "?";
    if (currentLang === 'pt') {
        // Usa correção ou capitaliza a primeira letra se não houver correção
        return ptCorrections[val] || val.charAt(0).toUpperCase() + val.slice(1);
    } else {
        // Usa tradução EN ou capitaliza
        return enMap[val] || val.charAt(0).toUpperCase() + val.slice(1);
    }
}

langBtn.addEventListener("click", () => {
    currentLang = currentLang === 'pt' ? 'en' : 'pt';
    localStorage.setItem('orkaZooLang', currentLang);
    langBtn.textContent = currentLang.toUpperCase();
    applyTranslation();
    updateDateDisplay();
    // Reconstruir grid para aplicar nova língua
    gridBody.innerHTML = "";
    gameState.guessedNames.forEach(name => {
        const obj = animalsDB.find(a => a.nome.pt === name);
        if(obj) renderRow(obj);
    });
});

function applyTranslation() {
    document.querySelectorAll("[data-t]").forEach(el => {
        const key = el.getAttribute("data-t");
        if(translations[currentLang][key]) el.textContent = translations[currentLang][key];
    });
    input.placeholder = currentLang === 'pt' ? "Digite um animal..." : "Type an animal...";
}

function t(key) { return translations[currentLang][key] || key; }

function updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = gameState.currentDate.toLocaleDateString(currentLang === 'pt' ? 'pt-BR' : 'en-US', options);
    dateDisplay.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

// ==========================================
// INPUT E LÓGICA
// ==========================================
input.addEventListener("input", function() {
    const val = normalizeStr(this.value);
    closeAllLists();
    if (!val) return;
    currentFocus = -1;

    let matches = animalsDB.filter(a => {
        const ptName = normalizeStr(a.nome.pt);
        const enName = normalizeStr(a.nome.en);
        return ptName.includes(val) || enName.includes(val);
    });

    // 5. ORDENAR ALFABETICAMENTE NA LÍNGUA ATUAL
    matches.sort((a, b) => {
        const nameA = currentLang === 'pt' ? a.nome.pt : a.nome.en;
        const nameB = currentLang === 'pt' ? b.nome.pt : b.nome.en;
        return nameA.localeCompare(nameB);
    });

    if (matches.length > 0) {
        suggestionsBox.style.display = "block";
        matches.forEach(match => {
            const div = document.createElement("div");
            div.className = "suggestion-item";
            div.textContent = currentLang === 'pt' ? match.nome.pt : match.nome.en;
            div.addEventListener("click", () => {
                input.value = currentLang === 'pt' ? match.nome.pt : match.nome.en;
                closeAllLists();
                input.focus();
            });
            suggestionsBox.appendChild(div);
        });
    }
});

input.addEventListener("keydown", function(e) {
    let items = suggestionsBox.getElementsByClassName("suggestion-item");
    if (e.key === "ArrowDown") {
        currentFocus++;
        addActive(items);
    } else if (e.key === "ArrowUp") {
        currentFocus--;
        addActive(items);
    } else if (e.key === "Enter") {
        e.preventDefault();
        if (currentFocus > -1 && items && items[currentFocus]) {
            items[currentFocus].click();
        } else {
            closeAllLists();
            processGuess();
        }
    }
});

function addActive(items) {
    if (!items) return false;
    for (let i = 0; i < items.length; i++) items[i].classList.remove("active");
    if (currentFocus >= items.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = (items.length - 1);
    items[currentFocus].classList.add("active");
    items[currentFocus].scrollIntoView({block: "nearest"});
}

function closeAllLists() {
    suggestionsBox.innerHTML = "";
    suggestionsBox.style.display = "none";
}
document.addEventListener("click", (e) => {
    if (e.target !== input && e.target !== suggestionsBox) closeAllLists();
});
submitBtn.addEventListener("click", processGuess);

function processGuess() {
    if (gameState.isGameOver) return;
    let guessName = input.value.trim();
    if(!guessName) return;

    // INICIAR TIMER NO PRIMEIRO CHUTE (SE NÃO EXISTIR)
    if (!startTime) {
        startTime = Date.now();
    }

    const guessObj = animalsDB.find(a => 
        normalizeStr(a.nome.pt) === normalizeStr(guessName) || 
        normalizeStr(a.nome.en) === normalizeStr(guessName)
    );
    
    if (!guessObj) { OrkaFX.toast(t("toastErrList"), "error"); OrkaFX.shake(); return; }
    if (gameState.guessedNames.has(guessObj.nome.pt)) { OrkaFX.toast(t("toastErrDup"), "error"); OrkaFX.shake(); return; }

    document.getElementById("empty-state").style.display = "none";

    gameState.guessedNames.add(guessObj.nome.pt);
    gameState.attemptsCount++;
    attemptDisplay.textContent = gameState.attemptsCount;
    
    renderRow(guessObj);
    saveProgress();
    
    input.value = "";
    closeAllLists();

    if (guessObj.nome.pt === gameState.targetAnimal.nome.pt) {
        endGame(true);
    } else if (gameState.attemptsCount >= MAX_ATTEMPTS) {
        endGame(false);
    }
}

// ==========================================
// RENDERIZAÇÃO GRID
// ==========================================
function renderRow(guess, isReveal = false) {
    const row = document.createElement("div");
    row.className = "guess-row";

    if (isReveal) {//Lógica de revelar em derrota
        row.classList.add("revealed");
    }

    const target = gameState.targetAnimal;
    
    // Nome
    const dName = currentLang === 'pt' ? guess.nome.pt : guess.nome.en;
    createCell(row, dName, guess.nome.pt === target.nome.pt ? "correct" : "wrong");

    // Peso
    let wClass = "wrong", wArrow = "";
    if (guess.peso === target.peso) wClass = "correct";
    else wArrow = guess.peso < target.peso ? "↑" : "↓";
    createCell(row, `${formatWeight(guess.peso)} <div class='arrow'>${wArrow}</div>`, wClass);

    // Dieta (Usa formatTerm para corrigir bug e traduzir)
    createCell(row, formatTerm(guess.dieta), guess.dieta === target.dieta ? "correct" : "wrong");

    // Habitat
    const dispHab = guess.habitat.map(h => formatTerm(h)).join(", ");
    createCell(row, dispHab, getArrayStatus(guess.habitat, target.habitat));

    // Continente (Global)
    let dispCont;
    if (guess.continentes.length >= 5) {
        dispCont = t("global");
    } else {
        dispCont = guess.continentes.map(c => formatTerm(c)).join(", ");
    }
    createCell(row, dispCont, getArrayStatus(guess.continentes, target.continentes));

    // Classe
    createCell(row, formatTerm(guess.classe), guess.classe === target.classe ? "correct" : "wrong");

    // População
    let pClass = "wrong", pArrow = "";
    const gIdx = popScale.indexOf(guess.populacao);
    const tIdx = popScale.indexOf(target.populacao);
    if (gIdx === tIdx) pClass = "correct";
    else pArrow = gIdx < tIdx ? "↑" : "↓";
    createCell(row, `${guess.populacao} <div class='arrow'>${pArrow}</div>`, pClass);

    if (isReveal) {
        gridBody.appendChild(row); // Na derrota, adiciona no FINAL
        // Scroll suave até o fim para ver a revelação
        setTimeout(() => row.scrollIntoView({ behavior: 'smooth' }), 100);
    } else {
        gridBody.prepend(row); // Chutes normais no TOPO
    }
}

let emojiHistory = [];

// ==========================================
// FUNÇÃO DE COMPARTILHAMENTO (NOVA)
// ==========================================
window.shareResult = function() {
    const dateStr = gameState.currentDate.toLocaleDateString('pt-BR');
    const attemptStr = gameState.isGameOver && gameState.guessedNames.has(gameState.targetAnimal.nome.pt) ? gameState.attemptsCount : "X";
    
    let text = `🦁 Orka Zoo ${dateStr}\nTentativas: ${attemptStr}/10\n\n`;
    
    // Reconstrói os emojis baseado no histórico de chutes
    gameState.guessedNames.forEach(name => {
        const guess = animalsDB.find(a => a.nome.pt === name);
        if(guess) {
            text += getEmojiRow(guess, gameState.targetAnimal) + "\n";
        }
    });

    text += "\nJogue em: orka-zoo.vercel.app"; // Seu link aqui

    navigator.clipboard.writeText(text).then(() => {
        OrkaFX.toast(t("shareMsg"), "success");
    }).catch(() => {
        OrkaFX.toast("Erro ao copiar", "error");
    });
};

// Gera a linha de emojis (🟩🟥🟨...)
function getEmojiRow(guess, target) {
    let row = "";
    
    // 1. Nome
    row += (guess.nome.pt === target.nome.pt) ? "🟩" : "🟥";
    
    // 2. Peso
    row += (guess.peso === target.peso) ? "🟩" : "🟥"; // Simplificado para share (sem setas para economizar caracteres ou pode usar ⬆️⬇️)
    
    // 3. Dieta
    row += (guess.dieta === target.dieta) ? "🟩" : "🟥";
    
    // 4. Habitat
    const habStatus = getArrayStatus(guess.habitat, target.habitat);
    row += (habStatus === "correct" ? "🟩" : (habStatus === "partial" ? "🟨" : "🟥"));
    
    // 5. Continente
    const contStatus = getArrayStatus(guess.continentes, target.continentes);
    row += (contStatus === "correct" ? "🟩" : (contStatus === "partial" ? "🟨" : "🟥"));
    
    // 6. Classe
    row += (guess.classe === target.classe) ? "🟩" : "🟥";
    
    // 7. População
    const gIdx = popScale.indexOf(guess.populacao);
    const tIdx = popScale.indexOf(target.populacao);
    row += (gIdx === tIdx) ? "🟩" : "🟥";

    return row;
}

function createCell(parent, html, status) {
    const div = document.createElement("div");
    div.className = `cell ${status}`;
    div.innerHTML = html;
    parent.appendChild(div);
}

// ==========================================
// STORAGE E CALENDÁRIO
// ==========================================
function getStorageKey() {
    const isoDate = gameState.currentDate.toISOString().split('T')[0];
    return `orkaZoo_${isoDate}`;
}

function saveProgress() {
    const data = {
        guessed: Array.from(gameState.guessedNames),
        over: gameState.isGameOver,
        win: gameState.isGameOver && Array.from(gameState.guessedNames).pop() === gameState.targetAnimal.nome.pt,
        startT: startTime, // Salva quando começou
        endT: endTime      // Salva quando terminou
    };
    localStorage.setItem(getStorageKey(), JSON.stringify(data));
    
    const isoDate = gameState.currentDate.toISOString().split('T')[0];
    const globalStats = JSON.parse(localStorage.getItem('orkaZoo_calendar') || '{}');
    globalStats[isoDate] = data.win ? 'win' : (data.over ? 'lose' : 'playing');
    localStorage.setItem('orkaZoo_calendar', JSON.stringify(globalStats));
}

function loadProgress() {
    const saved = localStorage.getItem(getStorageKey());
    if (saved) {
        const data = JSON.parse(saved);
        startTime = data.startT || null; // Recupera tempo
        endTime = data.endT || null;

        if (data.guessed.length > 0) {
            document.getElementById("empty-state").style.display = "none";
        }

        data.guessed.forEach(name => {
            const obj = animalsDB.find(a => a.nome.pt === name);
            if(obj) {
                gameState.guessedNames.add(name);
                gameState.attemptsCount++;
                renderRow(obj);
            }
        });
        
        attemptDisplay.textContent = gameState.attemptsCount;
        
        if(data.over) {
            gameState.isGameOver = true;
            input.disabled = true;
            submitBtn.disabled = true;
            
            // Se perdeu, precisamos re-renderizar a linha de revelação se ela não estiver salva nos palpites
            // Mas como você pediu para adicionar como um chute na derrota:
            if (!data.win) {
                 // Verifica se a linha de revelação já foi desenhada (opcional, ou apenas redesenha)
                 // Como o grid é limpo no init, precisamos desenhar a revelação aqui se for derrota
                 renderRow(gameState.targetAnimal, true);
            }
            
            showPageSummary(data.win); 
        }
    }
}

// Lógica Visual do Calendário
document.getElementById('calendar-btn').addEventListener('click', () => {
    calendarMonth = new Date(gameState.currentDate);
    renderCalendar();
    document.getElementById('modal-calendar').classList.add('active');
});
document.getElementById('prev-month').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() - 1); renderCalendar(); });
document.getElementById('next-month').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() + 1); renderCalendar(); });

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = "";
    
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    
    document.getElementById('calendar-month-year').textContent = calendarMonth.toLocaleDateString(currentLang === 'pt'?'pt-BR':'en-US', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];
    const currentGameDateStr = gameState.currentDate.toISOString().split('T')[0];
    const startDateStr = START_DATE.toISOString().split('T')[0];

    const globalStats = JSON.parse(localStorage.getItem('orkaZoo_calendar') || '{}');

    for(let i=0; i<firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'calendar-day empty';
        grid.appendChild(div);
    }

    for(let d=1; d<=daysInMonth; d++) {
        const div = document.createElement('div');
        div.className = 'calendar-day';
        div.textContent = d;
        
        const currentIso = new Date(year, month, d).toISOString().split('T')[0];
        
        // Bloqueio de datas antes de 2024 ou Futuro
        if (currentIso < startDateStr || currentIso > todayStr) {
            div.classList.add('disabled');
        } else {
            // Status do jogo
            if (globalStats[currentIso]) {
                div.classList.add(globalStats[currentIso]); // win(verde), playing(amarelo), lose(vermelho)
            }
            // Dia que está sendo jogado AGORA (Borda Azul)
            if (currentIso === currentGameDateStr) {
                div.classList.add('active-date');
            }

            div.onclick = () => {
                initGame(new Date(year, month, d));
                closeModal('modal-calendar');
            };
        }
        grid.appendChild(div);
    }
}

// ==========================================
// FIM DE JOGO
// ==========================================
function endGame(win) {
    gameState.isGameOver = true;
    endTime = Date.now(); // Para o tempo
    input.disabled = true;
    submitBtn.disabled = true;
    // SE PERDEU: Adiciona linha de revelação (Tudo errado visualmente)
    if (!win) {
        renderRow(gameState.targetAnimal, true);
    }
    saveProgress();

    const modal = document.getElementById('modal-end');
    const stats = document.getElementById('end-stats');
    const revealImg = document.getElementById('reveal-img');

    document.getElementById('end-title').textContent = win ? t('winTitle') : t('loseTitle');
    document.getElementById('end-title').style.color = win ? "var(--win-color)" : "var(--lose-color)";
    document.getElementById('end-msg').textContent = win ? t('winMsg') : t('loseMsg');
    document.getElementById('reveal-name').textContent = currentLang === 'pt' ? gameState.targetAnimal.nome.pt : gameState.targetAnimal.nome.en;
    
    const baseName = normalizeStr(gameState.targetAnimal.nome.pt).replace(/\s+/g, "");
    tryLoadImage(revealImg, baseName, ['png', 'jpg', 'jpeg', 'webp'], 0);//Carrega a respectiva imagem, se houver
    let timeStr = "";

    if (startTime && endTime) {
        const diff = Math.floor((endTime - startTime) / 1000);
        const min = Math.floor(diff / 60);
        const sec = diff % 60;
        timeStr = `${min}m ${sec}s`;
    }

    // Adiciona o tempo no texto do modal e resumo
    const animalName = currentLang === 'pt' ? gameState.targetAnimal.nome.pt : gameState.targetAnimal.nome.en;
    let statText = win 
        ? t('animalFound').replace('{animal}', animalName).replace('{attempts}', `<b>${gameState.attemptsCount}</b>`)
        : t('animalReveal').replace('{animal}', animalName);
    
    if (timeStr) {
        statText += `<br><span style="font-size:0.85rem; color:#888;">⏱ ${timeStr}</span>`;
    }

    stats.innerHTML = statText;

    if (win) { 
        OrkaFX.confetti(); 
        OrkaFX.toast(t('toastWin'), "success"); 
    } 
    else { 
        OrkaFX.toast(t('toastLose'), "error"); 
    }

    showPageSummary(win);
    setTimeout(() => { modal.classList.add('active'); }, 1500);
}

function showPageSummary(win) {
    const animalName = currentLang === 'pt' ? gameState.targetAnimal.nome.pt : gameState.targetAnimal.nome.en;
    let text = win 
        ? t('animalFound').replace('{animal}', animalName).replace('{attempts}', `<b>${gameState.attemptsCount}</b>`)
        : t('animalReveal').replace('{animal}', animalName);
        
    summaryBox.innerHTML = `
        <h3 style="color:${win ? 'var(--win-color)' : 'var(--lose-color)'}">${win ? t('winTitle') : t('loseTitle')}</h3>
        <p>${text}</p>
        <p style="font-size:0.8rem; color:#888; margin-top:15px; font-style:italic;">${t('tomorrow')}</p>
    `;
    summaryBox.style.display = "flex"; // Flex para centralizar
}

function tryLoadImage(img, name, formats, idx) {
    if (idx >= formats.length) { img.style.display = 'none'; return; }
    img.src = `assets/${name}.${formats[idx]}`;
    img.onload = () => img.style.display = 'block';
    img.onerror = () => tryLoadImage(img, name, formats, idx+1);
}

function normalizeStr(str) { return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function formatWeight(kg) { return kg < 1 ? (kg * 1000) + "g" : (kg >= 1000 ? (kg / 1000) + "t" : kg + "kg"); }
function getArrayStatus(g, t) {
    const intersect = g.filter(x => t.includes(x));
    if (g.length === t.length && intersect.length === t.length) return "correct";
    if (intersect.length > 0) return "partial";
    return "wrong";
}

window.closeModal = (id) => document.getElementById(id).classList.remove('active');

initGame();