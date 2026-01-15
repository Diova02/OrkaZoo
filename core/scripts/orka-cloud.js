// =========================
// ORKA CLOUD — Analytics Core (V2)
// =========================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?bundle&target=browser'

// 🔐 Configurações (Ajuste sua URL se mudou, mas a Key ANON é segura aqui)
const supabaseUrl = 'https://lvwlixmcgfuuiizeelmo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2d2xpeG1jZ2Z1dWlpemVlbG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4OTUwMzQsImV4cCI6MjA4MzQ3MTAzNH0.qa0nKUXewE0EqUePwfzQbBOaHypRqkhUxRnY5qgsDbo'

export const supabase = createClient(supabaseUrl, supabaseKey)

// Estado Local
let state = {
    sessionId: null,
    userId: null,
    gameId: null,
    startTime: null,
    isActive: false,
    sessionSaved: false // Controle do Anti-Bounce
};

// Configurações de Tempo
const BOUNCE_THRESHOLD = 5000; // 5 segundos para considerar sessão válida
const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutos
let inactivityTimer = null;
let bounceTimer = null;

// =========================
// 1. GESTÃO DE USUÁRIO
// =========================

async function initAuth() {
    // Verifica sessão atual
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        state.userId = session.user.id;
    } else {
        // Login Anônimo
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) { console.error("OrkaAuth Error:", error); return null; }
        state.userId = data.user.id;
    }

    // Garante perfil no banco
    await ensureProfile(state.userId);
    return state.userId;
}

async function ensureProfile(uid) {
    // Tenta pegar o nick local para garantir
    const localNick = localStorage.getItem('orka_nickname');
    
    // Verifica se já existe usando maybeSingle para não dar erro 406
    const { data: existing } = await supabase
        .from('players')
        .select('id, nickname')
        .eq('id', uid)
        .maybeSingle();

    if (!existing) {
        // Cria perfil
        await supabase.from('players').insert({
            id: uid,
            nickname: localNick || null,
            last_seen_at: new Date()
        });
    } else {
        // Atualiza Last Seen
        await supabase.from('players')
            .update({ last_seen_at: new Date() })
            .eq('id', uid);
            
        // Se o banco tem nick null mas localStorage tem algo, atualiza o banco
        if (!existing.nickname && localNick) {
            updateNickname(localNick);
        }
    }
}

// =========================
// 2. GESTÃO DE SESSÃO (COM ANTI-BOUNCE)
// =====================================

async function startSession(gameId) {
    state.gameId = gameId;
    state.startTime = Date.now();
    state.isActive = true;
    state.sessionSaved = false;
    
    await initAuth(); // Garante auth antes de tudo

    // Gera um ID de sessão localmente para usar nos rastreios imediatos
    state.sessionId = crypto.randomUUID(); 

    // MONITOR DE INATIVIDADE
    startInactivityMonitor();

    // ANTI-BOUNCE: Só salva no banco daqui a 5 segundos
    if (bounceTimer) clearTimeout(bounceTimer);
    bounceTimer = setTimeout(() => {
        if (state.isActive) {
            persistSessionStart();
        }
    }, BOUNCE_THRESHOLD);

    console.log(`OrkaCloud: Sessão iniciada (Local: ${state.sessionId})`);
    return state.sessionId;
}

// Grava a sessão no banco de fato (passou dos 5s)
async function persistSessionStart() {
    if (state.sessionSaved) return;
    
    const deviceInfo = {
        ua: navigator.userAgent,
        screen: `${window.screen.width}x${window.screen.height}`,
        mobile: /Mobi|Android/i.test(navigator.userAgent)
    };

    const { error } = await supabase.from('sessions').insert({
        id: state.sessionId, // Usa o ID que geramos
        player_id: state.userId,
        game_id: state.gameId,
        started_at: new Date(state.startTime),
        platform_info: deviceInfo
    });

    if (!error) {
        state.sessionSaved = true;
        console.log("OrkaCloud: Sessão persistida no DB (Anti-Bounce superado)");
    }
}

async function endSession(metadata = {}) {
    if (!state.sessionId) return;
    state.isActive = false;
    clearTimeout(bounceTimer);
    stopInactivityMonitor();

    const duration = Math.floor((Date.now() - state.startTime) / 1000);

    // Se a sessão durou menos que o bounce e não foi salva, IGNORA
    if (!state.sessionSaved && duration < (BOUNCE_THRESHOLD / 1000)) {
        console.log("OrkaCloud: Sessão Bounce ignorada (< 5s).");
        return;
    }

    // Se ainda não salvou (mas durou > 5s ou foi chamada explicitamente), salva o início agora
    if (!state.sessionSaved) {
        await persistSessionStart();
    }

    // Atualiza o fim
    await supabase.from('sessions').update({
        ended_at: new Date(),
        duration_seconds: duration,
        metadata: metadata
    }).eq('id', state.sessionId);

    state.sessionId = null;
}

// =========================
// 3. RASTREAMENTO (ADS & CONVERSÃO)
// =========================

async function track(eventName, eventType = 'click', data = {}) {
    // Se a sessão ainda não foi salva (bounce period), força salvar agora
    // porque se houve interação (clique), não é bounce!
    if (!state.sessionSaved && state.sessionId) {
        await persistSessionStart();
    }

    if (!state.sessionId || !state.userId) return;

    // Fire & Forget (não espera resposta para não travar UI)
    supabase.from('analytics_events').insert({
        session_id: state.sessionId,
        player_id: state.userId,
        event_name: eventName,
        event_type: eventType,
        event_data: data
    }).then(({ error }) => {
        if (error) console.warn("Track Error:", error);
    });
}

//EXEMPLO DE USO: (botão de dica fictício)
//OrkaCloud.track('used_hint' [nome do evento] , 'interaction' [tipo do evento], { 
//        animal_target: gameState.targetAnimal.nome.pt,
//        attempts_at_time: gameState.attemptsCount [conteúdo no "data"]
//    });

// =========================
// 4. UTILITÁRIOS & WATCHDOG
// =========================

function startInactivityMonitor() {
    const resetTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            console.warn("OrkaCloud: Usuário inativo. Encerrando sessão.");
            endSession({ reason: "inactivity_timeout" });
            window.location.href = '../../index.html'; // Volta pro Hub
        }, INACTIVITY_LIMIT);
    };

    // Reseta o timer em interações
    window.onload = resetTimer;
    document.onmousemove = resetTimer;
    document.onkeydown = resetTimer;
    document.ontouchstart = resetTimer;
    document.onclick = resetTimer;
}

function stopInactivityMonitor() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    document.onmousemove = null;
    document.onclick = null;
    // ... limpar outros listeners se precisar
}

async function updateNickname(newNickname) {
    localStorage.setItem('orka_nickname', newNickname);
    if (state.userId) {
        await supabase.from('players')
            .update({ nickname: newNickname })
            .eq('id', state.userId);
    }
}

function getNickname() {
    return localStorage.getItem('orka_nickname');
}

// API Pública
export const OrkaCloud = {
    startSession,
    endSession,
    track, // <--- Nova função
    updateNickname,
    getNickname,
    getUserId: () => state.userId
};