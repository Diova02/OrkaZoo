/* =========================================
   ORKA STUDIO - JS LIBRARY
   Funções utilitárias, FX e Lógica de Data.
   ========================================= */

// --- 1. MÓDULO DE EFEITOS (FX) ---
export const OrkaFX = {
    confetti: () => {
        const colors = ['#0055ff', '#ffffff', '#2e8b57', '#e4b00f', '#ff0055'];
        for (let i = 0; i < 60; i++) {
            const c = document.createElement('div');
            c.style.position = 'fixed'; 
            c.style.top = '-10px'; 
            c.style.width = '10px'; 
            c.style.height = '10px'; 
            c.style.zIndex = '9999'; 
            c.style.opacity = '0.8';
            c.style.left = Math.random() * 100 + 'vw';
            c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            
            const duration = Math.random() * 3 + 3;
            c.style.animation = `fall ${duration}s linear forwards`;
            c.style.animationDelay = Math.random() * 2 + 's';
            
            document.body.appendChild(c);
            setTimeout(() => c.remove(), duration * 1000 + 2000);
        }
    },
    
    toast: (msg, type = 'info') => {
        let container = document.getElementById('toast-container');
        if(!container) { // Cria se não existir
            container = document.createElement('div'); 
            container.id = 'toast-container'; // <--- CORREÇÃO AQUI (Era: id='toast-container')
            document.body.appendChild(container);
        }
        
        const div = document.createElement('div');
        div.className = `toast ${type}`;
        div.textContent = msg;
        
        container.appendChild(div);
        
        // Remove após 3 segundos
        setTimeout(() => {
            div.style.opacity = '0';
            setTimeout(() => div.remove(), 500); // Espera fade out
        }, 3000);
    },

    shake: (elementId) => {
        const el = document.getElementById(elementId);
        if(el) el.animate([
            { transform: 'translateX(-5px)' }, 
            { transform: 'translateX(5px)' }, 
            { transform: 'translateX(0)' }
        ], { duration: 300 });
    }
};

// --- 2. MÓDULO DE DATA (O Coração Determinístico) ---
export const OrkaDate = {
    getDailyIndex: (startDate, dbSize) => {
        const today = new Date();
        today.setHours(0,0,0,0);
        const start = new Date(startDate);
        const diffTime = Math.abs(today - start);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if(diffDays < 0) return 0;
        return diffDays % dbSize;
    },
    
    getIndexByDate: (targetDate, startDate, dbSize) => {
        const t = new Date(targetDate); t.setHours(0,0,0,0);
        const s = new Date(startDate);
        const diffTime = Math.abs(t - s);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if(diffDays < 0) return 0;
        return diffDays % dbSize;
    },

    getDailyCategories: (startDate, categoriesKeys) => {
        const today = new Date();
        today.setHours(0,0,0,0);
        const start = new Date(startDate);
        const diffTime = Math.abs(today - start);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        const baseIndex = diffDays * 3;
        
        let selected = [];
        for(let i = 0; i < 4; i++) {
            const index = (baseIndex + i) % categoriesKeys.length;
            selected.push(categoriesKeys[index]);
        }
        return selected;
    }
};

// --- 3. MÓDULO DE ARMAZENAMENTO ---
export const OrkaStorage = {
    save: (key, data) => localStorage.setItem(key, JSON.stringify(data)),
    load: (key) => JSON.parse(localStorage.getItem(key) || 'null'),
    updateCalendar: (dateObj, status) => {
        const iso = dateObj.toISOString().split('T')[0];
        const stats = JSON.parse(localStorage.getItem('orka_calendar_global') || '{}');
        stats[iso] = status;
        localStorage.setItem('orka_calendar_global', JSON.stringify(stats));
    }
};

// --- 4. UTILITÁRIOS GERAIS ---
export const Utils = {
    normalize: (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    toggleModal: (id, show = true) => {
        const el = document.getElementById(id);
        if(show) el.classList.add('active'); else el.classList.remove('active');
    }
};

// --- 5. MÓDULO MATEMÁTICO (NOVO) ---
export const OrkaMath = {
    // Algoritmo Mulberry32: Rápido e determinístico
    createSeededRNG: (seed) => {
        return function() {
            var t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    },

    // Gera semente baseada na data (YYYYMMDD)
    getDateSeed: (dateObj = new Date()) => {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return parseInt(`${y}${m}${d}`);
    }
};

// --- 6. MÓDULO DE ÁUDIO (NOVO) ---
export const OrkaAudio = {
    sounds: {},
    
    // Carrega os sons para memória
    load: (soundMap) => {
        for (const [key, path] of Object.entries(soundMap)) {
            const audio = new Audio(path);
            audio.preload = 'auto'; // Tenta carregar imediatamente
            OrkaAudio.sounds[key] = audio;
        }
    },

    // Toca o som (com suporte a rapid-fire)
    play: (key, volume = 1.0) => {
        const original = OrkaAudio.sounds[key];
        if (!original) return;

        // Clona o nó de áudio para permitir sons simultâneos (ex: 3 tiros rápidos)
        const clone = original.cloneNode();
        clone.volume = volume;
        clone.play().catch(e => console.warn("Audio bloqueado pelo navegador (interaja primeiro)"));
    }
};

// --- 7. MÓDULO DE CALENDÁRIO UI (NOVO) ---
export const OrkaCalendar = {
    // Renderiza o grid dentro de um container
    render: (containerId, labelId, dateRef, config = {}) => {
        const grid = document.getElementById(containerId);
        const label = document.getElementById(labelId);
        if(!grid || !label) return;

        grid.innerHTML = "";
        
        const year = dateRef.getFullYear();
        const month = dateRef.getMonth();
        
        // Atualiza título do mês (Ex: "Janeiro 2026")
        label.textContent = dateRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const todayStr = new Date().toISOString().split('T')[0];

        // Configurações padrão
        const { 
            minDate = '2024-01-01', 
            onClick = null,
            getDayClass = null // Função para retornar classes extras (win, lose, etc)
        } = config;

        // Dias vazios do início
        for(let i=0; i<firstDay; i++) {
            const div = document.createElement('div');
            div.className = 'calendar-day empty';
            grid.appendChild(div);
        }

        // Dias do mês
        for(let d=1; d<=daysInMonth; d++) {
            const div = document.createElement('div');
            div.className = 'calendar-day';
            div.textContent = d;
            
            const isoDate = new Date(year, month, d).toISOString().split('T')[0];
            
            // Verifica status customizado (Ex: se ganhou ou perdeu)
            if (getDayClass) {
                const extraClass = getDayClass(isoDate);
                if (extraClass) {
                    // CORREÇÃO: Divide a string por espaços e adiciona as classes individualmente
                    const classes = extraClass.trim().split(/\s+/);
                    if (classes[0]) div.classList.add(...classes);
                }
            }
            // Lógica de Bloqueio
            if (isoDate < minDate || isoDate > todayStr) {
                div.classList.add('disabled');
            } else {
                // Dia Ativo (Hover e Click)
                div.onclick = () => {
                    if(div.classList.contains('disabled')) return;
                    if(onClick) onClick(new Date(year, month, d));
                };
            }
            
            // Marca o dia selecionado visualmente
            // (Nota: dateRef é a data do Mês que estamos vendo, não necessariamente a selecionada. 
            // Para simplificar, quem chama deve passar a classe 'active-date' via getDayClass se quiser)
            
            grid.appendChild(div);
        }
    }
};