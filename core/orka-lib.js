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
            c.style.position = 'fixed'; c.style.top = '-10px'; c.style.width = '10px'; c.style.height = '10px'; c.style.zIndex = '9999'; c.style.opacity = '0.8';
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
            container = document.createElement('div'); id='toast-container'; document.body.appendChild(container);
        }
        const div = document.createElement('div');
        div.className = `toast ${type}`;
        div.textContent = msg;
        container.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    },

    shake: (elementId) => {
        const el = document.getElementById(elementId);
        if(el) el.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 300 });
    }
};

// --- 2. MÓDULO DE DATA (O Coração Determinístico) ---
export const OrkaDate = {
    getDailyIndex: (startDate, dbSize) => {
        // Lógica de checkpoints pode ser injetada aqui futuramente
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
    normalize: (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), //NORMALIZAR TEXTO ACENTUADO/ESPAÇADO: "Água viva" -> "aguaviva"
    toggleModal: (id, show = true) => {
        const el = document.getElementById(id);
        if(show) el.classList.add('active'); else el.classList.remove('active');
    }
};