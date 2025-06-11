import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

dotenv.config();

// Função para converter base64 em arquivo (sem alterações)
const salvarImagemBase64 = async (base64String, titulo) => {
    try {
        const diretorio = path.join(process.cwd(), 'public', 'imagens');
        if (!fs.existsSync(diretorio)) {
            fs.mkdirSync(diretorio, { recursive: true });
        }

        // Garante que o título seja uma string válida para nome de arquivo
        const tituloSeguro = titulo && typeof titulo === 'string' ? titulo : 'imagem-sem-titulo';
        const nomeArquivo = `${Date.now()}-${tituloSeguro.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`;
        const caminhoArquivo = path.join(diretorio, nomeArquivo);

        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        await fs.promises.writeFile(caminhoArquivo, buffer);
        console.log(`Imagem salva com sucesso em: ${caminhoArquivo}`);

        const baseUrl = process.env.API_URL || 'http://localhost:3000';
        const url = `${baseUrl}/imagens/${nomeArquivo}`;
        return url;
    } catch (error) {
        console.error('Erro detalhado ao salvar imagem:', {
            message: error.message,
            stack: error.stack,
        });
        return null;
    }
};

export default function(app) {
    // Configurar rota para servir arquivos estáticos da pasta 'public'
    app.use(express.static(path.join(process.cwd(), 'public')));

    app.post('/gerador-noticias', async (req, res) => {
        try {
            const { links } = req.body;
            if (!links) {
                return res.status(400).json({ message: 'O link da notícia é obrigatório.' });
            }

            // --- INÍCIO DA NOVA LÓGICA DE SCRAPING COM READABILITY.JS ---

            // 1. Buscar o HTML da página, simulando um navegador
            console.log(`Buscando conteúdo de: ${links}`);
            const response = await axios.get(links, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            const html = response.data;

            // 2. Usar JSDOM para criar um DOM virtual da página
            const doc = new JSDOM(html, { url: links });

            // 3. Usar Readability para extrair o conteúdo principal
            const reader = new Readability(doc.window.document);
            const article = reader.parse();

            // 4. Verificar se a extração foi bem-sucedida
            if (!article || !article.textContent) {
                throw new Error("Não foi possível extrair o conteúdo principal do artigo. O site pode ter uma estrutura incompatível ou ser protegido.");
            }
            
            // 5. Obter título e conteúdo limpos
            const tituloOriginal = article.title;
            const conteudoOriginal = article.textContent; // Texto puro, sem HTML!

            console.log(`Título extraído: ${tituloOriginal}`);
            console.log(`Tamanho do conteúdo extraído: ${conteudoOriginal.trim().split(/\s+/).length} palavras`);
            
            // --- FIM DA NOVA LÓGICA DE SCRAPING ---
            
            // Função para limpar texto de formatações markdown (usada na resposta da IA)
            const limparTextoMarkdown = (texto) => {
                return texto
                    .replace(/\*\*/g, '') .replace(/\*/g, '')
                    .replace(/_/g, '')  .replace(/`/g, '')
                    .replace(/#/g, '')
                    .replace(/\n+/g, ' ').replace(/\s+/g, ' ')
                    .trim();
            };

            // Preparar o prompt para a API do Deepseek (prompt já otimizado)
            const prompt = `
[C] CONTEXTO
Você é um jornalista experiente e editor-chefe de um grande portal de notícias online no Brasil. Sua especialidade é transformar informações brutas e comunicados em reportagens completas, aprofundadas e otimizadas para SEO, capazes de engajar o leitor do início ao fim. Sua tarefa é usar o material original abaixo como ponto de partida para criar uma matéria jornalística completa e original.
Título Original: ${tituloOriginal}
Conteúdo Original: ${conteudoOriginal}

[T] TOM E [A] AUDIÊNCIA
Tom: Adote um tom jornalístico, informativo, imparcial e profissional. A escrita deve ser envolvente e clara, utilizando uma linguagem rica para prender a atenção do leitor.
Audiência: O texto se destina ao público geral brasileiro, leitor de portais de notícias. A linguagem deve ser acessível, mas sem subestimar a inteligência do leitor.

[O] OBJETIVO
Seu objetivo é produzir um pacote de conteúdo completo para publicação, seguindo estritamente as diretrizes abaixo:
1. Desenvolver uma Notícia Aprofundada:
   - Extensão: O corpo da notícia deve ter entre 1.500 e 2.000 palavras.
   - Profundidade: Não se limite a reescrever o conteúdo original. Para atingir a extensão desejada, você deve expandir e aprofundar os pontos-chave. Adicione contexto histórico, explore as implicações dos eventos, inclua dados estatísticos (podem ser hipotéticos, mas realistas, se necessário), e desenvolva os argumentos com parágrafos bem estruturados. Crie uma narrativa coesa com introdução, desenvolvimento e conclusão.
   - SEO: Otimize o texto para mecanismos de busca, utilizando palavras-chave relevantes derivadas do conteúdo original de forma natural ao longo do artigo.
2. Criar um Título Otimizado: O título deve ser atraente, fiel ao conteúdo, e otimizado para SEO.
3. Produzir Conteúdo para Redes Sociais: Um resumo curto e impactante (máximo 200 caracteres) e 5 hashtags relevantes para Instagram.
4. Criar um Prompt para Imagem: Um prompt detalhado em inglês para gerar uma imagem que represente a notícia.

[N] NEGATIVO (REGRAS E RESTRIÇÕES)
- NÃO FAÇA PLÁGIO: A notícia final deve ser uma obra original, e não uma simples reordenação ou substituição de sinônimos do texto base.
- REMOVA MENÇÕES: Elimine qualquer menção a outros veículos de comunicação que possa existir no conteúdo original.
- EVITE CLICKBAIT: O título deve ser atraente, mas sem exageros, sensacionalismo ou promessas que não são cumpridas no texto.
- REGRAS DO PROMPT DE IMAGEM: O prompt deve instruir a IA a NÃO incluir texto ou palavras na imagem, evitar elementos polêmicos e focar em uma composição profissional com cores vibrantes.

FORMATO OBRIGATÓRIO DA RESPOSTA
A sua resposta final deve seguir EXATAMENTE este formato, sem nenhuma informação ou texto adicional fora dele:
TÍTULO: [aqui vai o novo título]
CONTEÚDO: [aqui vai o conteúdo da notícia com 1.500 a 2.000 palavras]
RESUMO: [aqui vai o resumo curto para redes sociais]
HASHTAGS: #[hashtag1] #[hashtag2] #[hashtag3] #[hashtag4] #[hashtag5]
IMAGE_PROMPT: [aqui vai o prompt detalhado em inglês para gerar a imagem]
            `;

            // Chamar a API do Deepseek com max_tokens
            console.log("Enviando prompt para a API Deepseek...");
            const deepseekResponse = await axios.post('https://api.deepseek.com/v1/chat/completions', {
                model: "deepseek-chat",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 4096 // <-- ESSENCIAL PARA RESPOSTAS LONGAS
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const respostaCompletaIA = deepseekResponse.data.choices[0].message.content;

            // Extrair as seções da resposta da IA usando Regex
            const extrairSecao = (regex, texto) => {
                const match = texto.match(regex);
                return match ? match[1].trim() : '';
            };

            const novoTitulo = extrairSecao(/TÍTULO:\s*([\s\S]*?)(?=CONTEÚDO:|$)/, respostaCompletaIA);
            const conteudoReescrito = extrairSecao(/CONTEÚDO:\s*([\s\S]*?)(?=RESUMO:|$)/, respostaCompletaIA);
            const resumo = extrairSecao(/RESUMO:\s*([\s\S]*?)(?=HASHTAGS:|$)/, respostaCompletaIA);
            const hashtags = extrairSecao(/HASHTAGS:\s*([\s\S]*?)(?=IMAGE_PROMPT:|$)/, respostaCompletaIA);
            const imagePrompt = extrairSecao(/IMAGE_PROMPT:\s*([\s\S]*?)$/, respostaCompletaIA);

            let imagemUrl = null;

            // Geração de imagem com Gemini
            if (imagePrompt) {
                try {
                    console.log('Iniciando geração de imagem com prompt:', imagePrompt);
                    const geminiResponse = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${process.env.GEMINI_API_KEY}`,
                        {
                            instances: [{ prompt: imagePrompt }],
                            parameters: { aspectRatio: "4:3", sampleCount: 1 }
                        },
                        { headers: { 'Content-Type': 'application/json' } }
                    );

                    const prediction = geminiResponse.data?.predictions?.[0];
                    if (prediction?.bytesBase64Encoded) {
                        imagemUrl = await salvarImagemBase64(prediction.bytesBase64Encoded, novoTitulo);
                    } else {
                        console.warn("Predição de imagem recebida, mas sem dados de imagem (bytesBase64Encoded).");
                    }
                } catch (error) {
                    console.error('Erro ao gerar ou salvar a imagem:', error.response?.data || error.message);
                    // Continua o processo mesmo se a imagem falhar
                }
            }

            console.log("Notícia e imagem processadas com sucesso.");
            res.status(200).json({
                message: 'Notícia gerada com sucesso!',
                data: {
                    titulo: novoTitulo,
                    conteudo: conteudoReescrito,
                    resumo: resumo,
                    hashtags: hashtags,
                    imagePrompt: imagePrompt,
                    imagemUrl: imagemUrl
                }
            });

        } catch (error) {
            console.error('Erro geral no endpoint /gerador-noticias:', {
                message: error.message,
                stack: error.stack,
                url: req.body.links
            });
            res.status(500).json({
                message: 'Erro ao processar a notícia.',
                error: error.message
            });
        }
    });
}