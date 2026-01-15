import fs from 'fs';
import { palavrasPT } from './palavras.js'; // Ajuste o caminho do seu arquivo original

// 1. LISTA DE EXCEÇÕES (O que deve continuar composto)
// Baseado na lista que você enviou: Países, Cidades, Marcas, Pessoas, Times, Personagens.
const MANTER_COMPOSTAS = new Set([
    // Países e Lugares
    "África do Sul", "Arábia Saudita", "Burkina Faso", "Cabo Verde", "Coreia do Norte", 
    "Coreia do Sul", "Costa do Marfim", "Costa Rica", "El Salvador", "Emirados Árabes", 
    "Estados Unidos", "Nova Zelândia", "Papua Nova Guiné", "Reino Unido", "República Checa", 
    "San Marino", "Santa Lúcia", "São Tomé e Príncipe", "Serra Leoa", "Sri Lanka", 
    "Timor-Leste", "Trinidad e Tobago", "São Paulo", "Rio de Janeiro", "Belo Horizonte", 
    "Porto Alegre", "São Luís", "Campo Grande", "João Pessoa", "Porto Velho", "Rio Branco", 
    "Boa Vista", "Nova York", "Buenos Aires", "Kuala Lumpur", "Hong Kong", "La Paz", 
    "Los Angeles", "Las Vegas", "São Francisco", "Adis Abeba",
    
    // Marcas e Empresas
    "Coca-Cola", "Burger King", "Banco do Brasil", "Oral-B", "Louis Vuitton", "Calvin Klein", 
    "Tommy Hilfiger", "Hot Wheels", "Google Home", "Alfa Romeo", "Land Rover", "Harley-Davidson", 
    "Royal Enfield", "Rolls-Royce", "Aston Martin", "Mini Cooper", "Orka Zoo", "Orka Studio", 
    "Red Bull", "Post-it", "Blu-ray", "Wi-Fi", "PlayStation", "Xbox",
    
    // Personagens e Pessoas Famosas
    "Homem-Aranha", "Homem de Ferro", "Capitão América", "Mulher Maravilha", "Darth Vader", 
    "Luke Skywalker", "Obi-Wan", "Harry Potter", "Sherlock Holmes", "James Bond", "Papai Noel", 
    "Coelhinho da Páscoa", "Fada do Dente", "Pato Donald", "Pica-Pau", "Scooby-Doo", 
    "Bob Esponja", "Lula Molusco", "Homer Simpson", "Master Chief", "Pac-Man", "Chun-Li", 
    "Sub-Zero", "Albert Einstein", "Isaac Newton", "Leonardo da Vinci", "Van Gogh", 
    "Salvador Dalí", "Dante Alighieri", "Machado de Assis", "Clarice Lispector", 
    "Fernando Pessoa", "Carlos Drummond", "Monteiro Lobato", "Paulo Coelho", "Jorge Amado", 
    "Júlio César", "Alexandre o Grande", "Joana d'Arc", "Rei Arthur", "Rainha Elizabeth", 
    "Princesa Diana", "Gengis Khan", "Nelson Mandela", "Martin Luther King", "Madre Teresa", 
    "Papa Francisco", "Dalai Lama", "Elvis Presley", "Michael Jackson", "Lady Gaga", 
    "Ivete Sangalo", "Roberto Carlos", "Cristiano Ronaldo", "Marilyn Monroe", "Audrey Hepburn", 
    "Charlie Chaplin", "Walt Disney", "Steven Spielberg", "Stan Lee", "J.K. Rowling", 
    "Bill Gates", "Steve Jobs", "Mark Zuckerberg", "Elon Musk", "Jeff Bezos", "Warren Buffett", 
    "Silvio Santos", "Fidel Castro", "Che Guevara", "Pedro Álvares Cabral", "Dom Pedro",
    
    // Times e Seleções
    "Atlético Mineiro", "Santa Cruz", "Athletico Paranaense", "Vila Nova", "Ponte Preta", 
    "Real Madrid", "Atlético de Madrid", "Manchester United", "Manchester City", "Inter de Milão", 
    "Bayern de Munique", "Borussia Dortmund", "Boca Juniors", "River Plate", "Seleção Brasileira", 
    "Seleção Argentina", "Seleção Alemã", "Seleção Italiana", "Seleção Francesa", "Red Sox",

    // Outros Nomes Próprios/Específicos
    "Copa do Mundo", "Champions League", "Ano Novo", "São João", "Dia das Mães", 
    "Dia dos Pais", "Dia dos Namorados", "Big Bang", "Via Láctea", "Bossa Nova", "Hip Hop", "K-Pop"
]);

function processarBanco() {
    console.log("Iniciando reprocessamento...");
    
    let novaLista = [];

    palavrasPT.forEach(palavra => {
        const termo = palavra.trim();
        
        // Verifica se é composta (tem espaço ou hífen)
        if (/[\s-]/.test(termo)) {
            // Se estiver na lista de exceções, mantém inteira
            if (MANTER_COMPOSTAS.has(termo)) {
                novaLista.push(termo);
            } else {
                // Se NÃO for exceção (ex: "Chave de fenda"), quebra em pedaços
                // O regex /[\s-]+/ quebra tanto por espaço quanto por hífen
                const partes = termo.split(/[\s-]+/);
                partes.forEach(p => {
                    // Evita adicionar preposições soltas se desejar (opcional), 
                    // aqui estou adicionando tudo que tem mais de 1 letra para evitar "e", "o" soltos
                    if (p.length > 1) novaLista.push(p); 
                });
            }
        } else {
            // Palavra simples, mantém
            novaLista.push(termo);
        }
    });

    // Remove duplicatas e ordena alfabeticamente
    // O Set remove duplicatas, o sort organiza
    const listaUnica = Array.from(new Set(novaLista)).sort((a, b) => a.localeCompare(b));

    // --- FORMATAÇÃO PERSONALIZADA (10 por linha) ---
    let conteudoArquivo = "export const palavrasPT = [\n";
    let bufferLinha = [];

    listaUnica.forEach((p, index) => {
        bufferLinha.push(`"${p}"`);

        // Se o buffer tem 10 itens ou é o último item da lista
        if (bufferLinha.length === 10 || index === listaUnica.length - 1) {
            conteudoArquivo += "  " + bufferLinha.join(", ") + (index === listaUnica.length - 1 ? "" : ",") + "\n";
            bufferLinha = []; // Limpa o buffer
        }
    });

    conteudoArquivo += "];\n";

    // Salvar
    fs.writeFileSync('palavras_otimizadas.js', conteudoArquivo, 'utf8');
    
    console.log(`✅ Sucesso!`);
    console.log(`- Arquivo 'palavras_otimizadas.js' gerado.`);
    console.log(`- Total de palavras finais: ${listaUnica.length}`);
}

processarBanco();