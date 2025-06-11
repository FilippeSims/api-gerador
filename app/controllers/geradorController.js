import * as cheerio from 'cheerio';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import express from 'express';

dotenv.config();

// Função para converter base64 em arquivo
const salvarImagemBase64 = async (base64String, titulo) => {
    try {
        // Criar diretório se não existir
        const diretorio = path.join(process.cwd(), 'public', 'imagens');
        console.log('Diretório para salvar imagem:', diretorio);
        
        if (!fs.existsSync(diretorio)) {
            console.log('Criando diretório de imagens...');
            fs.mkdirSync(diretorio, { recursive: true });
        }

        // Gerar nome do arquivo baseado no título
        const nomeArquivo = `${Date.now()}-${titulo.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`;
        const caminhoArquivo = path.join(diretorio, nomeArquivo);
        console.log('Caminho completo do arquivo:', caminhoArquivo);

        // Remover o prefixo da string base64 se existir
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
        console.log('Tamanho do base64:', base64Data.length);
        
        // Converter base64 para buffer e salvar
        const buffer = Buffer.from(base64Data, 'base64');
        console.log('Tamanho do buffer:', buffer.length);
        
        await fs.promises.writeFile(caminhoArquivo, buffer);
        console.log('Arquivo salvo com sucesso!');

        // Verificar se o arquivo foi realmente criado
        if (fs.existsSync(caminhoArquivo)) {
            console.log('Arquivo existe após salvar');
            const stats = fs.statSync(caminhoArquivo);
            console.log('Tamanho do arquivo:', stats.size, 'bytes');
        } else {
            console.error('Arquivo não foi criado!');
        }

        // Retornar URL completa
        const baseUrl = process.env.API_URL || 'http://localhost:3000';
        const url = `${baseUrl}/imagens/${nomeArquivo}`;
        console.log('URL da imagem:', url);
        return url;
    } catch (error) {
        console.error('Erro detalhado ao salvar imagem:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        return null;
    }
};

export default function(app) {
    // Configurar rota para servir arquivos estáticos
    app.use('/imagens', (req, res, next) => {
        const diretorio = path.join(process.cwd(), 'public', 'imagens');
        console.log('Servindo arquivos estáticos do diretório:', diretorio);
        if (!fs.existsSync(diretorio)) {
            console.log('Criando diretório de imagens para arquivos estáticos...');
            fs.mkdirSync(diretorio, { recursive: true });
        }
        next();
    }, express.static(path.join(process.cwd(), 'public', 'imagens')));

    app.post('/gerador-noticias', async (req, res) => {
        try {
            const { links } = req.body;

            // Buscar o conteúdo da notícia do link fornecido
            const response = await axios.get(links);
            const $ = cheerio.load(response.data);

            // Função para limpar texto
            const limparTexto = (texto) => {
                return texto
                    .replace(/\s+/g, ' ')
                    .replace(/\n+/g, ' ')
                    .trim();
            };

            // Função para limpar texto de formatações markdown
            const limparTextoMarkdown = (texto) => {
                return texto
                    .replace(/\*\*/g, '') // Remove asteriscos duplos
                    .replace(/\*/g, '') // Remove asteriscos simples
                    .replace(/_/g, '') // Remove underscores
                    .replace(/`/g, '') // Remove backticks
                    .replace(/#/g, '') // Remove hashtags
                    .replace(/\n+/g, ' ') // Substitui múltiplas quebras de linha por espaço
                    .replace(/\s+/g, ' ') // Remove espaços extras
                    .trim(); // Remove espaços no início e fim
            };

            // Função para analisar o conteúdo da página
            const analisarConteudo = () => {
                // Remover elementos que geralmente não contêm o conteúdo principal
                $('script, style, nav, header, footer, aside, .menu, .sidebar, .ad, .advertisement, .banner, .popup, .modal, .cookie-notice, .newsletter, .social-share, .comments, .related-posts, .recommended, .suggested, .trending, .popular, .more-news, .other-news').remove();

                // Função para calcular a pontuação de um elemento
                const calcularPontuacao = (elemento) => {
                    const $elem = $(elemento);
                    let pontuacao = 0;

                    // Verificar quantidade de parágrafos
                    const paragrafos = $elem.find('p').length;
                    pontuacao += paragrafos * 2;

                    // Verificar quantidade de texto
                    const texto = $elem.text();
                    const palavras = texto.split(/\s+/).filter(p => p.length > 3);
                    pontuacao += palavras.length * 0.1;

                    // Verificar se contém elementos típicos de notícias
                    if ($elem.find('h1, h2, h3').length > 0) pontuacao += 3;
                    if ($elem.find('img').length > 0) pontuacao += 2;
                    if ($elem.find('time, .date, .timestamp').length > 0) pontuacao += 2;

                    // Verificar se está próximo ao título principal
                    const tituloPrincipal = $('h1').first();
                    if (tituloPrincipal.length > 0) {
                        const distancia = Math.abs($elem.index() - tituloPrincipal.index());
                        if (distancia < 10) pontuacao += 5;
                    }

                    // Penalizar elementos muito pequenos ou muito grandes
                    if (palavras.length < 50) pontuacao -= 10;
                    if (palavras.length > 2000) pontuacao -= 5;

                    // Penalizar elementos que parecem ser listas ou menus
                    if ($elem.find('li').length > 10) pontuacao -= 10;
                    if ($elem.find('a').length > 20) pontuacao -= 10;

                    // Penalizar elementos que parecem ser barras laterais ou rodapés
                    if ($elem.hasClass('sidebar') || $elem.hasClass('footer') || $elem.hasClass('aside')) {
                        pontuacao -= 20;
                    }

                    return pontuacao;
                };

                // Analisar todos os elementos do body
                let melhorElemento = null;
                let melhorPontuacao = 0;

                // Primeiro, tentar encontrar o elemento principal usando seletores comuns
                const seletoresPrincipais = [
                    'article',
                    '.article-content',
                    '.post-content',
                    '.news-content',
                    'main',
                    '.main-content',
                    '#content',
                    '.entry-content',
                    '.story-content'
                ];

                for (const seletor of seletoresPrincipais) {
                    const elemento = $(seletor).first();
                    if (elemento.length > 0) {
                        const pontuacao = calcularPontuacao(elemento);
                        if (pontuacao > melhorPontuacao) {
                            melhorPontuacao = pontuacao;
                            melhorElemento = elemento;
                        }
                    }
                }

                // Se não encontrou com seletores específicos, analisar todos os elementos
                if (!melhorElemento) {
                    $('body *').each((i, elem) => {
                        const pontuacao = calcularPontuacao(elem);
                        if (pontuacao > melhorPontuacao) {
                            melhorPontuacao = pontuacao;
                            melhorElemento = elem;
                        }
                    });
                }

                if (melhorElemento) {
                    // Extrair o texto do elemento encontrado
                    const conteudo = $(melhorElemento).text();
                    return limparTexto(conteudo);
                }

                // Se não encontrar um elemento específico, pegar todo o texto do body
                return limparTexto($('body').text());
            };

            // Função para encontrar o título
            const encontrarTitulo = () => {
                // Primeiro, procurar por elementos que geralmente contêm o título principal
                const elementosTitulo = $('h1, .title, .headline, .article-title, .post-title');
                
                if (elementosTitulo.length > 0) {
                    // Filtrar elementos que parecem ser títulos de notícias
                    const possiveisTitulos = elementosTitulo.filter((i, elem) => {
                        const texto = $(elem).text();
                        return texto.length > 10 && texto.length < 200; // Títulos geralmente têm esse tamanho
                    });

                    if (possiveisTitulos.length > 0) {
                        return limparTexto(possiveisTitulos.first().text());
                    }
                }

                // Se não encontrar um título específico, procurar por texto que parece um título
                const textos = $('body').text().split('\n');
                for (const texto of textos) {
                    const limpo = limparTexto(texto);
                    if (limpo.length > 10 && limpo.length < 200 && limpo.endsWith('.')) {
                        return limpo;
                    }
                }

                return '';
            };

            const conteudoOriginal = analisarConteudo();
            const tituloOriginal = encontrarTitulo();

            console.log('Título original:', tituloOriginal);
            console.log('Conteúdo original:', conteudoOriginal);

            // Preparar o prompt para a API do Deepseek
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

                Desenvolver uma Notícia Aprofundada:

                Extensão: O corpo da notícia deve ter entre 1.500 e 2.000 palavras.
                Profundidade: Não se limite a reescrever o conteúdo original. Para atingir a extensão desejada, você deve expandir e aprofundar os pontos-chave. Adicione contexto histórico, explore as implicações dos eventos, inclua dados estatísticos (podem ser hipotéticos, mas realistas, se necessário), e desenvolva os argumentos com parágrafos bem estruturados. Crie uma narrativa coesa com introdução, desenvolvimento e conclusão.
                SEO: Otimize o texto para mecanismos de busca, utilizando palavras-chave relevantes derivadas do conteúdo original de forma natural ao longo do artigo.
                Criar um Título Otimizado:

                O título deve ser atraente, fiel ao conteúdo, e otimizado para SEO.
                Produzir Conteúdo para Redes Sociais:

                Um resumo curto e impactante (máximo 200 caracteres).
                5 hashtags relevantes para Instagram.
                Criar um Prompt para Imagem:

                Um prompt detalhado em inglês para gerar uma imagem que represente a notícia.
                [N] NEGATIVO (REGRAS E RESTRIÇÕES)

                NÃO FAÇA PLÁGIO: A notícia final deve ser uma obra original, e não uma simples reordenação ou substituição de sinônimos do texto base.
                REMOVA MENÇÕES: Elimine qualquer menção a outros veículos de comunicação que possa existir no conteúdo original.
                EVITE CLICKBAIT: O título deve ser atraente, mas sem exageros, sensacionalismo ou promessas que não são cumpridas no texto.
                REGRAS DO PROMPT DE IMAGEM: O prompt deve instruir a IA a NÃO incluir texto ou palavras na imagem, evitar elementos polêmicos e focar em uma composição profissional com cores vibrantes.
                FORMATO OBRIGATÓRIO DA RESPOSTA

                A sua resposta final deve seguir EXATAMENTE este formato, sem nenhuma informação ou texto adicional fora dele:

                TÍTULO: [aqui vai o novo título]
                CONTEÚDO: [aqui vai o conteúdo da notícia com 1.500 a 2.000 palavras]
                RESUMO: [aqui vai o resumo curto para redes sociais]
                HASHTAGS: #[hashtag1] #[hashtag2] #[hashtag3] #[hashtag4] #[hashtag5]
                IMAGE_PROMPT: [aqui vai o prompt detalhado em inglês para gerar a imagem]
            `;

            // Chamar a API do Deepseek
            const deepseekResponse = await axios.post('https://api.deepseek.com/v1/chat/completions', {
                model: "deepseek-chat",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const resposta = deepseekResponse.data.choices[0].message.content;
            
            // Extrair título, conteúdo, resumo, hashtags e prompt da imagem
            const matchTitulo = resposta.match(/TÍTULO:\s*(.*?)(?=CONTEÚDO:|$)/s);
            const matchConteudo = resposta.match(/CONTEÚDO:\s*(.*?)(?=RESUMO:|$)/s);
            const matchResumo = resposta.match(/RESUMO:\s*(.*?)(?=HASHTAGS:|$)/s);
            const matchHashtags = resposta.match(/HASHTAGS:\s*(.*?)(?=IMAGE_PROMPT:|$)/s);
            const matchImagePrompt = resposta.match(/IMAGE_PROMPT:\s*(.*?)$/s);

            const novoTitulo = matchTitulo ? limparTextoMarkdown(matchTitulo[1].trim()) : '';
            const conteudoReescrito = matchConteudo ? limparTextoMarkdown(matchConteudo[1].trim()) : '';
            const resumo = matchResumo ? limparTextoMarkdown(matchResumo[1].trim()) : '';
            const hashtags = matchHashtags ? limparTextoMarkdown(matchHashtags[1].trim()) : '';
            const imagePrompt = matchImagePrompt ? limparTextoMarkdown(matchImagePrompt[1].trim()) : '';

            let imagemUrl = '';
            let imagemBase64 = '';
            try {
                console.log('Iniciando geração de imagem com prompt:', imagePrompt);
                
                // Gerar imagem usando Gemini
                const geminiResponse = await axios({
                    method: 'post',
                    url: 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict',
                    params: {
                        key: 'AIzaSyCaXdWOrkbUhJu8hukWYv5wlRZmHqLMkZ4'
                    },
                    data: {
                        instances: [
                            {
                                prompt: imagePrompt
                            }
                        ],
                        parameters: {
                            aspectRatio: "4:3",
                            sampleCount: 1
                        }
                    },
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                console.log('Resposta do Gemini recebida');
                console.log('Status da resposta:', geminiResponse.status);
                console.log('Headers da resposta:', geminiResponse.headers);
                console.log('Resposta completa:', JSON.stringify(geminiResponse.data, null, 2));
                
                // Verificar se temos uma resposta válida
                if (!geminiResponse.data) {
                    throw new Error('Resposta vazia do Gemini');
                }

                // Verificar a estrutura da resposta
                const predictions = geminiResponse.data.predictions || [];
                console.log('Número de predictions:', predictions.length);

                if (predictions.length === 0) {
                    console.error('Resposta do Gemini:', geminiResponse.data);
                    throw new Error('Nenhuma predição retornada. Verifique se a API key está correta e se o modelo está disponível.');
                }

                // Verificar se temos a imagem na predição
                const prediction = predictions[0];
                console.log('Estrutura da predição:', prediction);

                // A imagem está no campo bytesBase64Encoded
                const imagem = prediction.bytesBase64Encoded;
                if (!imagem) {
                    console.error('Estrutura da predição:', prediction);
                    throw new Error('Sem dados de imagem na predição. Verifique a estrutura da resposta.');
                }

                console.log('Imagem recebida do Gemini');
                imagemBase64 = imagem;

                // Garantir que temos um base64 válido
                if (!imagemBase64.startsWith('data:image/')) {
                    imagemBase64 = `data:image/jpeg;base64,${imagemBase64}`;
                }

                // Salvar a imagem
                console.log('Tentando salvar imagem...');
                const diretorio = path.join(process.cwd(), 'public', 'imagens');
                console.log('Diretório de destino:', diretorio);
                
                // Garantir que o diretório existe
                if (!fs.existsSync(diretorio)) {
                    console.log('Criando diretório de imagens...');
                    fs.mkdirSync(diretorio, { recursive: true });
                }

                // Gerar nome do arquivo
                const nomeArquivo = `${Date.now()}-${novoTitulo.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`;
                const caminhoArquivo = path.join(diretorio, nomeArquivo);
                console.log('Caminho completo do arquivo:', caminhoArquivo);
                
                try {
                    // Remover o prefixo do base64
                    const base64Data = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
                    console.log('Tamanho do base64:', base64Data.length);
                    
                    // Converter e salvar
                    const buffer = Buffer.from(base64Data, 'base64');
                    console.log('Tamanho do buffer:', buffer.length);
                    
                    // Usar writeFileSync para garantir que o arquivo seja salvo
                    fs.writeFileSync(caminhoArquivo, buffer);
                    console.log('Arquivo salvo com sucesso!');
                    
                    // Verificar se o arquivo foi salvo
                    if (fs.existsSync(caminhoArquivo)) {
                        const stats = fs.statSync(caminhoArquivo);
                        console.log('Arquivo existe e tem tamanho:', stats.size, 'bytes');
                        
                        const baseUrl = process.env.API_URL || 'http://localhost:3000';
                        imagemUrl = `${baseUrl}/imagens/${nomeArquivo}`;
                        console.log('URL da imagem:', imagemUrl);
                    } else {
                        throw new Error('Arquivo não foi criado após writeFileSync');
                    }
                } catch (writeError) {
                    console.error('Erro ao escrever arquivo:', {
                        message: writeError.message,
                        code: writeError.code,
                        path: caminhoArquivo
                    });
                    throw writeError;
                }

            } catch (error) {
                console.error('Erro ao processar imagem:', {
                    message: error.message,
                    stack: error.stack,
                    response: error.response?.data,
                    status: error.response?.status,
                    headers: error.response?.headers
                });
            }

            console.log('Novo título:', novoTitulo);
            console.log('Conteúdo reescrito:', conteudoReescrito);
            console.log('Resumo:', resumo);
            console.log('Hashtags:', hashtags);
            console.log('Image Prompt:', imagePrompt);
            console.log('Imagem URL:', imagemUrl);

            res.status(200).json({
                message: 'Notícia gerada com sucesso!',
                data: {
                    titulo: novoTitulo,
                    conteudo: conteudoReescrito,
                    resumo: resumo,
                    hashtags: hashtags,
                    imagePrompt: imagePrompt,
                    imagemUrl: imagemUrl || null,
                    imagemBase64: imagemBase64 || null
                }
            });
        } catch (error) {
            console.error('Erro ao processar a notícia:', error.response?.data || error.message);
            res.status(500).json({
                message: 'Erro ao processar a notícia',
                error: error.response?.data?.error || error.message
            });
        }
    });
}