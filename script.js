import { OrkaCloud } from './core/scripts/orka-cloud.js';
import { OrkaFX } from './core/scripts/orka-lib.js'; // Importando FX para o Toast

// --- DADOS DO HUB (TRADUÇÃO + JOGOS) ---
export const translations = {
    'pt': {
        dailyGames: "Jogos Diários", webGames: "Jogos Web", pnpGames: "PnP", soonGames: "Nos próximos episódios...",
        profileBtn: "Configurar Perfil", emptyMsg: "Nada aqui ainda!",
        profileTitle: "PERFIL", nickLabel: "Seu Apelido", langLabel: "Idioma / Language",
        readyBtn: "Tudo pronto, {nick}!", addNick: "Adicionar Nickname",
        profileTitle: "PERFIL",
        nickLabel: "Seu Apelido",
        langLabel: "Idioma / Language",
        langDesc: "Jogos usarão esta preferência automaticamente.",
        readyBtn: "Tudo pronto, {nick}!", addNick: "Adicionar Nickname",
        
        game_zoo_desc: "Descubra o animal do dia.",
        game_jinx_desc: "Leia a mente alheia.",
        game_listit_desc: "Deduza a ordem do dia.",
        game_disco_desc: "Descubra a música do dia.",
        game_eagle_desc: "Atire o mais rápido que puder.",
        game_firewall_desc: "Evolua seu poderoso canhão.",
    },
    'en': {
        dailyGames: "Daily Games", webGames: "Web Games", pnpGames: "Print & Play", soonGames: "Coming Soon...",
        profileBtn: "Profile Settings", emptyMsg: "Nothing here yet!",
        profileTitle: "PROFILE", nickLabel: "Your Nickname", langLabel: "Language",
        readyBtn: "All set, {nick}!", addNick: "Add Nickname",
        profileTitle: "PROFILE",
        nickLabel: "Nickname",
        langLabel: "Language",
        langDesc: "Games will use this preference automatically.",

        game_zoo_desc: "Discover the daily animal.",
        game_jinx_desc: "Read other minds.",
        game_listit_desc: "Deduce the daily order.",
        game_disco_desc: "Guess the daily song.",
        game_eagle_desc: "Shoots how fast you can.",
        game_firewall_desc: "Grind your powerfull channon."
    }
};

export const gamesList = [
    { id: 'zoo', type: 'daily', title: 'ORKA ZOO', descKey: 'game_zoo_desc', icon: 'zoo-logo.png', print: 'print-zoo.png', url: 'games/orkazoo/', releaseDate: '2026-01-05', active: true }, // Exemplo: data passada
    { id: 'jinx', type: 'web', title: 'ORKA JINX', descKey: 'game_jinx_desc', icon: 'jinx-logo.png', print: 'print-jinx.png', url: 'games/orkajinx/', releaseDate: '2026-01-13', active: true },
    // Jogos em breve (active: false)
    { id: 'listit', type: 'soon', title: 'LISTIT', descKey: 'game_listit_desc', icon: null, print: null, url: '#', active: false },
    { id: 'disco', type: 'soon', title: 'DISCOMANIA', descKey: 'game_disco_desc', icon: null, print: null, url: '#', active: false },
    { id: 'eagle', type: 'soon', title: 'EAGLE AIM', descKey: 'game_eagle_desc', icon: null, print: null, url: '#', active: false },
    { id: 'firewall', type: 'soon', title: 'FIREWALL', descKey: 'game_firewall_desc', icon: null, print: null, url: '#', active: false }
];

// --- ELEMENTOS DO DOM ---
const modal = document.getElementById('modal-profile');
const btnOpen = document.getElementById('btn-profile');
const btnClose = document.getElementById('btn-close-profile');

const viewMode = document.getElementById('view-nick-mode');
const editMode = document.getElementById('edit-nick-mode');
const displayNick = document.getElementById('display-nick');
const inputNick = document.getElementById('input-nick');
const btnEdit = document.getElementById('btn-edit-nick');
const btnSave = document.getElementById('btn-save-nick');
const btnDelete = document.getElementById('btn-delete-nick');
const btnAdd = document.getElementById('btn-add-nick');

const langBtns = document.querySelectorAll('.lang-option');
const btnWelcome = document.getElementById('btn-welcome-ready');

let welcomeBtn = null;

// --- FUNÇÕES ---

// Transforma loadProfileData em async para esperar o Cloud
async function loadProfileData() {
    // 1. CARREGAMENTO INICIAL (A MÁGICA ACONTECE AQUI)
    // Isso garante que temos os dados reais do banco antes de decidir abrir o modal
    await OrkaCloud.init();

    await OrkaCloud.startSession('orka_hub'); // <--- ISSO GERA O SESSION_ID

    const currentNick = OrkaCloud.getNickname();
    const currentLang = OrkaCloud.getLanguage();
    const avatarUrl = OrkaCloud.getAvatarUrl();

    const currentBolo = OrkaCloud.getBolo();
    const boloDisplay = document.getElementById('header-bolo-count');
    if (boloDisplay) boloDisplay.textContent = currentBolo;

    // Reset visual
    if(welcomeBtn) welcomeBtn.style.display = 'none';

    // Imagem de avatar
    const imgElement = document.getElementById('user-avatar');
    const container = document.querySelector('.profile-avatar-box');

    if (avatarUrl) {
        // Estado de Carregamento
        container.classList.add('loading');
        imgElement.style.display = 'none';
        
        // Inicia carregamento
        const tempImg = new Image();
        tempImg.src = avatarUrl;
        tempImg.onload = () => {
            imgElement.src = avatarUrl;
            imgElement.style.display = 'block';
            container.classList.remove('loading');
            document.getElementById('default-avatar-icon').style.display = 'none';
        };
        tempImg.onerror = () => {
            // Fallback se falhar
            container.classList.remove('loading');
            document.getElementById('default-avatar-icon').style.display = 'block';
        };
    } else {
        // Sem avatar definido
        container.classList.remove('loading');
        imgElement.style.display = 'none';
        document.getElementById('default-avatar-icon').style.display = 'block';
    }

    // 3. Nickname & Lógica de Abertura Automática
    if (currentNick) {
        // Tem nick: Mostra normal
        displayNick.textContent = currentNick;
        inputNick.value = currentNick;
        
        viewMode.style.display = 'flex';
        editMode.style.display = 'none';
        if(btnAdd) btnAdd.style.display = 'none';
    } else {
        // Não tem nick: Prepara UI de "Novo"
        displayNick.textContent = '';
        inputNick.value = '';
        
        viewMode.style.display = 'none';
        editMode.style.display = 'none';
        if(btnAdd) btnAdd.style.display = 'block'; 

        // LÓGICA DA PRIMEIRA VEZ (Check LocalStorage)
        const hasSeenIntro = localStorage.getItem('orka_hub_intro_seen');
        
        if (!hasSeenIntro) {
            openModal(false); // Abre
            OrkaFX.toast("Bem vindo ao Orka Hub!", "info"); // Toast
            localStorage.setItem('orka_hub_intro_seen', 'true'); // Marca como visto
        }
    }

    applyHubTranslation();

    // 4. Idioma
    langBtns.forEach(btn => {
        if (btn.dataset.lang === currentLang) btn.classList.add('selected');
        else btn.classList.remove('selected');
    });
}

function openModal(forceStay = false) {
    if (!modal) return;
    modal.classList.add('active');
    if(btnClose) btnClose.style.display = 'flex'; 
    modal.onclick = (e) => { if(e.target === modal) modal.classList.remove('active'); };
}

function toggleEditMode(isEditing) {
    if (isEditing) {
        viewMode.style.display = 'none';
        if(btnAdd) btnAdd.style.display = 'none';
        editMode.style.display = 'flex';
        inputNick.focus();
    } else {
        loadProfileData();
    }
}

async function saveNickname() {
    const newNick = inputNick.value.trim();
    if (newNick) {
        await OrkaCloud.updateNickname(newNick);
        
        editMode.style.display = 'none';
        viewMode.style.display = 'none';
        if(btnAdd) btnAdd.style.display = 'none';

        // Lógica Limpa:
        if (btnWelcome) {
            // Pega tradução dinâmica
            const lang = OrkaCloud.getLanguage().startsWith('en') ? 'en' : 'pt';
            const msg = translations[lang].readyBtn.replace('{nick}', newNick);
            
            btnWelcome.textContent = msg;
            btnWelcome.style.display = 'block';
            btnWelcome.onclick = () => modal.classList.remove('active');
        }

        if (!welcomeBtn) {
            welcomeBtn = document.createElement('button');
            welcomeBtn.className = 'orka-btn orka-btn-primary';
            welcomeBtn.style.width = '100%';
            welcomeBtn.style.marginTop = '15px';
            welcomeBtn.style.padding = '15px';
            welcomeBtn.onclick = () => modal.classList.remove('active');
            const container = document.querySelector('.profile-section');
            if(container) container.appendChild(welcomeBtn);
        }

        welcomeBtn.textContent = `Tudo pronto, ${newNick}!`;
        welcomeBtn.style.display = 'block';
        
        if (!localStorage.getItem('orka_language')) OrkaCloud.setLanguage('pt-BR');
        
        // Garante que não abre mais sozinho
        localStorage.setItem('orka_hub_intro_seen', 'true');
    } else {
        await deleteNickname();
        loadProfileData();
    }
}

async function deleteNickname() {
    localStorage.removeItem('orka_nickname');
    await OrkaCloud.updateNickname('');
    loadProfileData();
}

// Eventos
if (btnOpen) btnOpen.addEventListener('click', () => { 
    // Força abrir mesmo se já viu intro, pois foi clique manual
    openModal(false); 
    loadProfileData(); // Recarrega dados para garantir frescor
});

if (btnClose) btnClose.addEventListener('click', () => modal.classList.remove('active'));
if (btnEdit) btnEdit.addEventListener('click', () => toggleEditMode(true));
if (btnAdd) btnAdd.addEventListener('click', () => toggleEditMode(true));
if (btnSave) btnSave.addEventListener('click', saveNickname);
if (inputNick) inputNick.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveNickname(); });
if (btnDelete) btnDelete.addEventListener('click', deleteNickname);

langBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        OrkaCloud.setLanguage(lang);
        loadProfileData();
    });
});

// Exemplo de conexão (adicione no seu script.js)
const btnRegister = document.getElementById('btn-register');
const btnLogin = document.getElementById('btn-login');

btnRegister.onclick = async () => {
    const email = document.getElementById('acc-email').value;
    const pass = document.getElementById('acc-pass').value;
    
    // Chama o OrkaCloud V3.3
    const result = await OrkaCloud.registerAccount(email, pass);
    
    if (result.success) {
        if (result.bonus) OrkaFX.toast("Conta criada! +5 Bolos 🎂", "success");
        else OrkaFX.toast("Conta atualizada!", "success");
        // Fecha modal
    } else {
        OrkaFX.toast(result.error, "error");
    }
};

btnLogin.onclick = async () => {
    const email = document.getElementById('acc-email').value;
    const pass = document.getElementById('acc-pass').value;
    
    // Chama o OrkaCloud V3.3
    const result = await OrkaCloud.loginAccountAccount(email, pass);
    
    if (result.success) {
        if (result.bonus) OrkaFX.toast("Conta criada! +5 Bolos 🎂", "success");
        else OrkaFX.toast("Conta atualizada!", "success");
        // Fecha modal
    } else {
        OrkaFX.toast(result.error, "error");
    }
};

function applyHubTranslation() {
    // 1. Pega idioma (padrão 'pt' se 'pt-BR')
    const langFull = OrkaCloud.getLanguage() || 'pt-BR';
    const lang = langFull.startsWith('en') ? 'en' : 'pt';
    const t = translations[lang];

    // 2. Traduz textos simples
    document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.getAttribute('data-t');
        if (t[key]) el.textContent = t[key];
    });

    // 3. Traduz atributos (ex: title do botão)
    document.querySelectorAll('[data-t-title]').forEach(el => {
        const key = el.getAttribute('data-t-title');
        if (t[key]) el.title = t[key];
    });

    // 4. Re-renderiza jogos para atualizar descrições
    renderGames(lang);
}

// script.js (Versão Com Tag NOVO)

function renderGames(lang) {
    ['daily', 'web', 'soon', 'pnp'].forEach(type => {
        const container = document.getElementById(`list-${type}`);
        if(container) container.innerHTML = '';
    });

    const t = translations[lang];

    gamesList.forEach(game => {
        const container = document.getElementById(`list-${game.type}`);
        if (!container) return;

        const card = document.createElement(game.active ? 'a' : 'div');
        card.className = 'game-card-horizontal';
        
        if (!game.active) {
            card.style.opacity = '0.5';
            card.style.cursor = 'default';
        } else {
            card.href = game.url;
            card.onclick = (e) => {
                e.preventDefault();
                OrkaCloud.track('game_click', 'hub_conversion', { game: game.id });
                setTimeout(() => window.location.href = game.url, 150);
            };
        }

        const printSrc = game.print ? `assets/prints/${game.print}` : '';
        
        // --- LÓGICA DA TAG NOVO ---
        const isNew = checkIsNew(game.releaseDate);
        const tagHTML = (isNew && game.active) ? `<span class="tag-new">NOVO</span>` : '';

        // Usamos uma div wrapper 'print-container' para segurar a tag no lugar certo
        // A imagem ocupa 100% desse container
        const printHTML = game.active ? 
            `<div class="print-container">
                <img src="${printSrc}" class="card-print" style="height:100%; border:none;" onerror="this.src='assets/icons/orka-logo.png'">
                ${tagHTML}
             </div>` : 
            `<div class="card-print" style="display:flex; align-items:center; justify-content:center; color:#444; font-size:1.5rem;">🚧</div>`;

        const iconSrc = game.icon ? `assets/icons/${game.icon}` : '';
        const desc = t[game.descKey] || '...';
        
        const iconHTML = game.active ? 
            `<img src="${iconSrc}" class="card-icon" onerror="this.style.background='#333'">` : '';

        card.innerHTML = `
            ${printHTML}
            <div class="card-content">
                <div class="card-info-top">
                    ${iconHTML}
                    <div class="card-text">
                        <h3>${game.title}</h3>
                        <p>${desc}</p>
                    </div>
                </div>
                ${game.active ? '<div class="card-action"><span class="material-icons">play_arrow</span></div>' : ''}
            </div>
        `;
        container.appendChild(card);
    });
}

// Helper function
function checkIsNew(dateString) {
    if (!dateString) return false;
    const release = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - release);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays <= 7; // 7 dias
}

// ==================================================
// CORREÇÃO DA SESSÃO "INÚTIL" (Adicione isso no final do arquivo)
// ==================================================
window.addEventListener('beforeunload', () => {
    // Quando o usuário sai da página (fecha aba ou clica num jogo),
    // encerramos a sessão do Hub imediatamente.
    OrkaCloud.endSession({ reason: 'navigation_or_close' });
});

// Inicialização
window.addEventListener('load', loadProfileData);