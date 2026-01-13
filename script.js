import { OrkaCloud } from './core/scripts/orka-cloud.js';

    // Elementos (Mantenha os que já existiam, adicionei checagens de segurança)
    const modal = document.getElementById('modal-profile');
    const btnOpen = document.getElementById('btn-profile');
    const btnClose = document.getElementById('btn-close-profile');
    
    const viewMode = document.getElementById('view-nick-mode');
    const editMode = document.getElementById('edit-nick-mode');
    const displayNick = document.getElementById('display-nick');
    const inputNick = document.getElementById('input-nick');
    const btnAdd = document.getElementById('btn-add-nick');

    const langBtns = document.querySelectorAll('.lang-option');

    // --- FUNÇÕES ---

    function loadProfileData() {
        const currentNick = OrkaCloud.getNickname();
        const currentLang = OrkaCloud.getLanguage();

        // 1. Lógica do Nickname
        if (currentNick) {
            // USUÁRIO JÁ EXISTE
            displayNick.textContent = currentNick;
            inputNick.value = currentNick;
            
            viewMode.style.display = 'flex';
            editMode.style.display = 'none';
            btnAdd.style.display = 'none';
            
            // Libera o botão de fechar
            btnClose.style.display = 'flex';
        } else {
            // NOVO USUÁRIO (Modo Boas Vindas)
            displayNick.textContent = '';
            inputNick.value = '';
            
            viewMode.style.display = 'none';
            editMode.style.display = 'none';
            btnAdd.style.display = 'block'; // Mostra botão grande
            
            // Abre o modal automaticamente e força interação
            openModal(true); 
        }

        // 2. Lógica do Idioma
        langBtns.forEach(btn => {
            if (btn.dataset.lang === currentLang) btn.classList.add('selected');
            else btn.classList.remove('selected');
        });
    }

    // Função para abrir modal (com opção de forçar "sem saída")
    function openModal(forceStay = false) {
        modal.classList.add('active');
        if (forceStay) {
            btnClose.style.display = 'none'; // Esconde o X
            // Opcional: Adicionar lógica para não fechar clicando fora (no overlay)
            modal.onclick = (e) => { if(e.target === modal) return; }; 
        } else {
            btnClose.style.display = 'flex';
            modal.onclick = (e) => { if(e.target === modal) modal.classList.remove('active'); };
        }
    }

    async function saveNickname() {
        const newNick = inputNick.value.trim();
        if (!newNick) return; // Não deixa salvar vazio na criação

        await OrkaCloud.updateNickname(newNick);
        
        // Se for a primeira vez, salva o idioma padrão também se não estiver setado
        if (!localStorage.getItem('orka_language')) {
             OrkaCloud.setLanguage('pt-BR');
        }

        loadProfileData(); // Atualiza a tela (vai fazer o botão X aparecer)
    }

    // --- EVENTOS ---
    
    // Botão do Header
    btnOpen.addEventListener('click', () => { 
        loadProfileData(); // Recarrega dados
        openModal(false); // Abre modo normal (com botão fechar)
    });
    
    btnClose.addEventListener('click', () => modal.classList.remove('active'));

    // Botões de Nick
    document.getElementById('btn-edit-nick').addEventListener('click', () => {
        viewMode.style.display = 'none';
        editMode.style.display = 'flex';
        inputNick.focus();
    });

    // O botão "Criar Identidade" agora abre direto o input
    btnAdd.addEventListener('click', () => {
        btnAdd.style.display = 'none';
        editMode.style.display = 'flex';
        inputNick.focus();
    });

    document.getElementById('btn-save-nick').addEventListener('click', saveNickname);
    inputNick.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveNickname(); });

    // Idioma
    langBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const lang = btn.dataset.lang;
            OrkaCloud.setLanguage(lang);
            loadProfileData(); // Atualiza visual
        });
    });

    // --- INICIALIZAÇÃO ---
    // Verifica tudo ao carregar a página
    window.addEventListener('load', loadProfileData);
