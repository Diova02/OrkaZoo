# 🦁 ZOO LOGICAL - ORKA ZOO

Um jogo de dedução diária baseado em zoologia, estilo Wordle.

## 🎮 Como Jogar
O jogador deve descobrir o animal secreto do dia. A cada tentativa, o jogo compara atributos (Peso, Dieta, Habitat, etc.) e fornece feedback visual.

## 🛠️ Estrutura do Projeto
- `index.html`: Estrutura e interface.
- `style.css`: Estilização (Tema Orka Studio).
- `script.js`: Lógica do jogo, controle de estado e renderização.
- `animais.js`: Banco de dados JSON dos animais.

## 🚀 Como Adicionar Novos Animais
1. Abra o arquivo `animais.js`.
2. Adicione um novo objeto ao final do array seguindo o modelo:
   ```json
   {
     "nome": { "pt": "Nome", "en": "Name" },
     "peso": 0.0, // Em Kg
     "dieta": "Carnivoro",
     "habitat": ["terrestre"],
     "continentes": ["America"],
     "classe": "Mamifero",
     "populacao": "Milhares" // Use a escala definida
   }

## IMPORTANTE: 
1. Nunca mude a ordem dos animais antigos para não quebrar o histórico do calendário.
2. Para adicionar imagens dos animais vá na pasta assets e salve-os em qualquer formato (png, jpeg, webp) com o nome concatenado e sem acentos. "tamanduabandeira.png", por exemplo.

## 📊 Analytics
Atualmente os dados são salvos apenas no LocalStorage do navegador do usuário.

## 📄 Licença
Desenvolvido por Orka Studio.