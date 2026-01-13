// =========================
// ORKA CLOUD — Analytics Core
// =========================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?bundle&target=browser'

// 🔐 Conexão com o Supabase
const supabaseUrl = 'https://lvwlixmcgfuuiizeelmo.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2d2xpeG1jZ2Z1dWlpemVlbG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4OTUwMzQsImV4cCI6MjA4MzQ3MTAzNH0.qa0nKUXewE0EqUePwfzQbBOaHypRqkhUxRnY5qgsDbo'

// Exportando para que os jogos possam usar (resolve erros de conexão duplicada)
export const supabase = createClient(supabaseUrl, supabaseKey)

// Estado Local
let currentSessionId = null;

// =========================
// UTILIDADES
// =========================

function getPlayerId() {
  let id = localStorage.getItem('orka_player_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('orka_player_id', id)
  }
  return id
}

function getNickname() {
  return localStorage.getItem('orka_nickname')
}

// =========================
// REGISTRO DE JOGADOR
// =========================

async function registerPlayer(playerId) {
  // CORREÇÃO: Usar upsert evita o erro 409 (Conflict) se o jogador já existir
  await supabase
    .from('players')
    .upsert({ id: playerId }) 
    .select()
    .maybeSingle()
}

// =========================
// NICKNAME
// =========================

async function askForNickname(playerId) {
  let nickname = getNickname()

  if (!nickname) {
    // Tenta evitar prompt se não for estritamente necessário agora, 
    // mas mantém lógica original se preferir.
    // nickname = prompt('Como você quer ser chamado? (opcional)') 
    // (Prompt pode bloquear carregamento, ideal é gerenciar via UI do jogo)
  }
}

async function updateNickname(newNickname) {
  const playerId = getPlayerId()
  localStorage.setItem('orka_nickname', newNickname)

  await supabase
    .from('players')
    .update({ nickname: newNickname }) // Assume que a coluna existe e é atualizável
    .eq('id', playerId)
}

// =========================
// SESSÕES (CORRIGIDO)
// =========================

async function startSession(gameId) {
  const sessionId = crypto.randomUUID()
  const playerId = getPlayerId()
  
  // 1. Memoriza o ID localmente
  currentSessionId = sessionId;

  await registerPlayer(playerId)
  
  // Evitamos o prompt aqui para não travar o fluxo de analytics silencioso
  // await askForNickname(playerId) 

  const { error } = await supabase.from('sessions').insert({
    id: sessionId,
    player_id: playerId,
    game_id: gameId
  })

  if (error) console.warn("OrkaCloud: Erro ao iniciar sessão", error);

  return sessionId
}

async function endSession() {
  // 2. Usa o ID memorizado (não precisa receber argumento)
  if (!currentSessionId) return;

  const { error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date() })
    .eq('id', currentSessionId)

  if (error) console.warn("OrkaCloud: Erro ao finalizar sessão", error);
  
  // Limpa
  currentSessionId = null;
}

// =========================
// API PÚBLICA
// =========================

export const OrkaCloud = {
  startSession,
  endSession,
  getNickname,
  updateNickname,
  getPlayerId
}