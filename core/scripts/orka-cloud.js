// =========================
// ORKA CLOUD V3.3 — Account & Sync Edition
// =========================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?bundle&target=browser'

const supabaseUrl = 'https://lvwlixmcgfuuiizeelmo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2d2xpeG1jZ2Z1dWlpemVlbG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4OTUwMzQsImV4cCI6MjA4MzQ3MTAzNH0.qa0nKUXewE0EqUePwfzQbBOaHypRqkhUxRnY5qgsDbo'

export const supabase = createClient(supabaseUrl, supabaseKey)

let state = {
    sessionId: null,
    userId: null,
    gameId: null,
    startTime: null,
    isActive: false,
    sessionSaved: false,
    email: null,
    profile: {
        nickname: null,
        bolo: 0,
        image: 'default',
        language: 'pt-BR',
        is_registered: false // NOVO
    }
};

let authPromise = null; // Controle de Race Condition
const BOUNCE_THRESHOLD = 5000;
const INACTIVITY_LIMIT = 10 * 60 * 1000;
let timers = { inactivity: null, bounce: null };

// =========================
// 1. AUTH & INIT
// =========================

// Detecta login/logout e recarrega para limpar o estado antigo
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && state.userId && session?.user?.id !== state.userId) {
        console.log("🔄 Usuário mudou! Recarregando...");
        window.location.reload();
    }
    if (event === 'SIGNED_OUT') {
        window.location.reload();
    }
});
async function initAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        state.userId = session.user.id;
        state.email = session.user.email; // <--- CAPTURA O EMAIL
    } else {
        const { data } = await supabase.auth.signInAnonymously();
        state.userId = data.user.id;
        state.email = null;
    }
    
    await ensureProfile(state.userId);
    return state.userId;
}

async function init() {
    await initAuth();
    return state.profile;
}

async function ensureProfile(uid) {
    const { data: remote } = await supabase.from('players').select('*').eq('id', uid).maybeSingle();
    
    if (!remote) {
        const localNick = localStorage.getItem('orka_nickname');
        const newProfile = { id: uid, nickname: localNick || null, language: 'pt-BR', bolo: 0, profile_image: 'default' };
        await supabase.from('players').insert(newProfile);
        Object.assign(state.profile, newProfile);
    } else {
        state.profile = { 
            nickname: remote.nickname, 
            bolo: remote.bolo, 
            image: remote.profile_image, 
            language: remote.language,
            is_registered: remote.is_registered // NOVO
        };
        supabase.from('players').update({ last_seen_at: new Date() }).eq('id', uid);
    }
}

// =========================
// 1.5 SISTEMA DE CONTA (NOVO)
// =========================

// Transforma Anônimo em Registrado (Mantém Saves e Bolos)
async function registerAccount(email, password) {
    if (!state.userId) return { error: "Sem conexão." };

    // Vincula email ao ID atual
    const { data, error } = await supabase.auth.updateUser({ email, password });

    if (error) return { error: translateAuthError(error.message) };

    // Atualiza flag e dá bônus
    if (!state.profile.is_registered) {
        await supabase.from('players').update({ is_registered: true }).eq('id', state.userId);
        await addBolo(5); // 🎁 Bônus!
        state.profile.is_registered = true;
        return { success: true, bonus: true };
    }
    return { success: true, bonus: false };
}

// Loga em conta existente (Substitui sessão atual)
async function loginAccount(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: translateAuthError(error.message) };
    return { success: true };
}

async function logout() {
    await supabase.auth.signOut();
}

function translateAuthError(msg) {
    if (msg.includes("already registered")) return "Este email já tem conta.";
    if (msg.includes("Invalid login")) return "Email ou senha incorretos.";
    if (msg.includes("password")) return "Senha muito fraca (mínimo 6 dígitos).";
    return msg;
}

// =========================
// 2. ECONOMIA, SESSÃO & TRACKING (Mantém V3.2)
// =========================
// ... (Copiar as funções addBolo, claimDailyReward, setProfileImage igual à V3.2) ...

async function addBolo(amount) {
    if (!state.userId) return;
    state.profile.bolo += amount; 
    const { error } = await supabase.rpc('add_bolo', { amount });
    if (error) state.profile.bolo -= amount;
}
async function claimDailyReward(gameTag, amount = 1) {
    if (!state.userId) return false;
    const { data, error } = await supabase.rpc('claim_daily_reward', { game_tag: gameTag, amount });
    if (!error && data === true) { state.profile.bolo += amount; return true; }
    return false;
}
async function checkDailyClaimStatus(gameTag) {
    if (!state.userId) return false;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('daily_rewards').select('id').eq('player_id', state.userId).eq('game_id', gameTag).eq('reward_date', today).maybeSingle();
    return !!data;
}
async function setProfileImage(imgName) {
    state.profile.image = imgName;
    if (state.userId) await supabase.from('players').update({ profile_image: imgName }).eq('id', state.userId);
}
function getAvatarUrl() {
    if (!state.profile.image || state.profile.image === 'default') return null;
    return `../../assets/avatars/${state.profile.image}.png`;
}

// SESSÃO
async function startSession(gameId) {
    state.gameId = gameId;
    state.startTime = Date.now();
    state.isActive = true;
    state.sessionId = crypto.randomUUID();
    console.log(`🚀 Sessão iniciada: ${state.sessionId}`);

    initAuth(); // Não bloqueante
    
    monitorInactivity();
    if (timers.bounce) clearTimeout(timers.bounce);
    timers.bounce = setTimeout(() => { if (state.isActive) persistSession(); }, BOUNCE_THRESHOLD);
    return state.sessionId;
}

async function persistSession() {
    if (state.sessionSaved) return;
    if (!state.userId && authPromise) await authPromise;

    const info = { ua: navigator.userAgent, mobile: /Mobi|Android/i.test(navigator.userAgent) };
    const { error } = await supabase.from('sessions').insert({
        id: state.sessionId, player_id: state.userId, game_id: state.gameId,
        started_at: new Date(state.startTime), platform_info: info
    });
    if (!error) state.sessionSaved = true;
    else console.error("🚨 Erro Session:", error.message);
}

async function endSession(metadata = {}) {
    if (!state.sessionId) return;
    state.isActive = false;
    clearTimers();
    const duration = Math.floor((Date.now() - state.startTime) / 1000);
    const isImportant = Object.keys(metadata).length > 0;
    if (!state.sessionSaved && !isImportant && duration < 5) return;
    if (!state.sessionSaved) await persistSession();
    await supabase.from('sessions').update({ ended_at: new Date(), duration_seconds: duration, metadata }).eq('id', state.sessionId);
    //state.sessionId = null;
}

// Em core/scripts/orka-cloud.js

async function track(eventName, type = 'interaction', data = {}) {
    // 1. Se não tem sessão salva mas temos um ID local, força o salvamento agora
    // (Isso resolve o problema de eventos que ocorrem antes dos 5s do BOUNCE_THRESHOLD)
    if (!state.sessionSaved && state.sessionId) {
        console.log("⏳ Forçando salvamento de sessão para trackear evento...");
        await persistSession(); 
    }

    // 2. Verifica se agora temos tudo para salvar
    if (state.sessionId && state.userId) {
        // ADICIONADO: await e captura de erro
        const { error } = await supabase.from('analytics_events').insert({
            session_id: state.sessionId,
            player_id: state.userId,
            event_name: eventName,
            event_type: type,
            event_data: data
        });

        if (error) {
            console.error("❌ Erro ao trackear:", error.message, error.details);
        } else {
            console.log(`✅ Evento '${eventName}' registrado.`);
        }
    } else {
        console.warn("⚠️ Track ignorado: Sessão ou Usuário não iniciados.");
    }
}

// Retorna o Top 10 de um jogo em uma data específica
async function getLeaderboard(gameId, dateObj = new Date()) {
    const dateStr = dateObj.toISOString().split('T')[0];
    
    // Agora buscamos 'profile_image' em vez de 'avatar_url'
    const { data, error } = await supabase
        .from('leaderboards')
        .select(`score, player_id, players(nickname, profile_image)`) 
        .eq('game_id', gameId)
        .eq('played_at', dateStr)
        .order('score', { ascending: true }) 
        .limit(10);

    if (error) {
        console.error("Erro Leaderboard:", error);
        return [];
    }
    
    return data.map(entry => {
        // TRATAMENTO DO AVATAR
        // Se vier null ou vazio, usa 'default'. Se vier 'fox', usa 'fox'.
        const imageSlug = entry.players?.profile_image || 'default';
        const avatarPath = `../../assets/avatars/${imageSlug}.png`;

        return {
            nickname: entry.players?.nickname || 'Anônimo',
            avatar: avatarPath, 
            score: entry.score,
            isMe: entry.player_id === state.userId
        };
    });
}

// Envia o score (O banco já trata o "Upsert" graças à constraint unique)
async function submitScore(gameId, score, dateObj = new Date()) {
    if (!state.userId) await initAuth(); // Garante login (anônimo ou real)
    
    const dateStr = dateObj.toISOString().split('T')[0];

    // Primeiro, verificamos se já existe um score MELHOR (menor) hoje
    const { data: current } = await supabase
        .from('leaderboards')
        .select('score')
        .eq('game_id', gameId)
        .eq('player_id', state.userId)
        .eq('played_at', dateStr)
        .maybeSingle();

    // Se já existe um tempo menor gravado, não faz nada
    if (current && current.score <= score) {
        return { success: true, newRecord: false };
    }

    // Se não existe ou o novo é melhor, faz o UPSERT
    const { error } = await supabase
        .from('leaderboards')
        .upsert({ 
            game_id: gameId, 
            player_id: state.userId, 
            score: score,
            played_at: dateStr
        }, { onConflict: 'game_id, player_id, played_at' });

    if (error) return { error: error.message };
    return { success: true, newRecord: true };
}

// Helpers
function logAdImpression(adId, adType) { track('ad_impression', 'ad_impression', { ad_id: adId, ad_type: adType }); }
function logAdClick(adId, adType) { track('ad_click', 'ad_click', { ad_id: adId, ad_type: adType }); }
function monitorInactivity() {
    const reset = () => {
        if (timers.inactivity) clearTimeout(timers.inactivity);
        timers.inactivity = setTimeout(() => { endSession({ reason: 'timeout' }); window.location.href = '../../index.html'; }, INACTIVITY_LIMIT);
    };
    ['mousemove','click','keydown','touchstart'].forEach(e => document.addEventListener(e, reset));
    reset();
}
function clearTimers() { clearTimeout(timers.bounce); clearTimeout(timers.inactivity); }

export const OrkaCloud = {
    init, startSession, endSession, track, logAdImpression, logAdClick,
    getNickname: () => state.profile.nickname,
    updateNickname: async (n) => { state.profile.nickname=n; localStorage.setItem('orka_nickname',n); if(state.userId) await supabase.from('players').update({nickname:n}).eq('id',state.userId); },
    getBolo: () => state.profile.bolo,
    addBolo, claimDailyReward, checkDailyClaimStatus,
    getAvatarUrl, setProfileImage,
    getLanguage: () => state.profile.language,
    setLanguage: async (l) => { state.profile.language=l; localStorage.setItem('orka_language',l); if(state.userId) await supabase.from('players').update({language:l}).eq('id',state.userId); },
    getUserId: () => state.userId,
    // NOVOS EXPORTS
    registerAccount, loginAccount, logout,
    isRegistered: () => state.profile.is_registered,
    getLeaderboard,
    submitScore,

    // --- AUTENTICAÇÃO / SYNC ---
    async requestEmailLogin(email) {
        // Removemos o 'shouldCreateUser' explícito para evitar conflitos, 
        // o padrão do Supabase já é criar se não existir (se habilitado no painel).
        const { data, error } = await supabase.auth.signInWithOtp({
            email: email
            // Não passamos options extras para usar o padrão "Magic Link" 
            // que contém o token no corpo do email
        });
        return { success: !error, error };
    },

    async verifyEmailLogin(email, token) {
        // Garante que não tem espaços extras que causam erro 403
        const cleanEmail = email.trim();
        const cleanToken = token.trim();

        const { data, error } = await supabase.auth.verifyOtp({
            email: cleanEmail,
            token: cleanToken,
            type: 'email'
        });
        
        if (!error && data.session) {
            state.userId = data.session.user.id;
            
            // Puxa o perfil para checar se é novo
            const { data: profile } = await supabase.from('players')
                .select('*')
                .eq('id', state.userId)
                .maybeSingle();
                
            let isFirstTime = false;

            if (profile) {
                // Atualiza estado local
                state.profile = {
                    ...state.profile,
                    bolo: profile.bolo,
                    inventory: profile.inventory || { avatars: ['default'] },
                    nickname: profile.nickname,
                    image: profile.profile_image
                };

                // Lógica do Bônus: Apenas avisa que foi a primeira vez, não faz UI aqui
                if (!profile.is_registered) {
                    await addBolo(5); // Função interna do cloud, essa funciona
                    await supabase.from('players').update({ is_registered: true }).eq('id', state.userId);
                    isFirstTime = true;
                }
            }

            // Salva a sessão para persistir no reload
            await supabase.auth.setSession(data.session);
            
            // Retorna sucesso e a flag se é novo usuário
            return { success: true, isNewUser: isFirstTime };
        }
        
        return { success: false, error };
    },

    // --- INVENTÁRIO & SHOP ---
    
    // Verifica se o usuário tem o item
    hasItem: (itemId, type = 'avatars') => {
        const inv = state.profile.inventory || { avatars: ['default'] };
        const list = inv[type] || [];
        return list.includes(itemId);
    },

    // Compra/Adiciona item e salva na nuvem
    async unlockItem(itemId, type = 'avatars', cost = 0) {
        if (!state.userId) return false;
        
        // 1. Verifica saldo
        if (state.profile.bolo < cost) return false;

        // 2. Atualiza Localmente
        if (!state.profile.inventory) state.profile.inventory = { avatars: ['default'] };
        if (!state.profile.inventory[type]) state.profile.inventory[type] = [];
        
        if (state.profile.inventory[type].includes(itemId)) return true; // Já tem
        
        state.profile.inventory[type].push(itemId);
        state.profile.bolo -= cost;

        // 3. Persiste no Banco
        const { error } = await supabase.from('players').update({
            inventory: state.profile.inventory,
            bolo: state.profile.bolo
        }).eq('id', state.userId);

        return !error;
    },

    // --- CLOUD SAVE (O Segredo da Sincronia) ---

    // Chame isso ao abrir um jogo (ex: no init do OrkaZoo)
    async loadGameSave(gameId) {
        if (!state.userId) return null;

        const { data } = await supabase.from('game_saves')
            .select('save_data')
            .eq('player_id', state.userId)
            .eq('game_id', gameId)
            .maybeSingle();

        if (data) {
            console.log(`☁️ Save do ${gameId} baixado!`);
            // Retorna os dados para o jogo decidir como usar
            return data.save_data; 
        }
        return null;
    },

    // Chame isso ao fazer progresso importante (ex: terminar partida)
    async saveGameProgress(gameId, dataObject) {
        if (!state.userId) return;

        // "Upsert" = Atualiza se existe, Cria se não existe
        await supabase.from('game_saves').upsert({
            player_id: state.userId,
            game_id: gameId,
            save_data: dataObject,
            updated_at: new Date()
        });
        console.log(`☁️ Progresso do ${gameId} salvo na nuvem.`);
    },

    getEmail: () => state.email, // <--- EXPORTA A FUNÇÃO
    
    // Função de Logout (Útil para testar)
    logout: async () => {
        await supabase.auth.signOut();
        window.location.reload(); // Recarrega para gerar novo ID anônimo
    }
};