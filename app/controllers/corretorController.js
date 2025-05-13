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

    app.post('/corretor-noticias', async (req, res) => {
        try {
            const { texto } = req.body;
            
            if (!texto) {
                return res.status(400).json({
                    message: 'O campo texto é obrigatório'
                });
            }

            console.log('Texto recebido para revisão:', texto.substring(0, 100) + '...');

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

            // Preparar o prompt para a API do Deepseek
            const prompt = `
                Você é um editor profissional especializado em português brasileiro.
                Revise o texto abaixo corrigindo erros ortográficos e gramaticais.
                Melhore a fluência e clareza, mas mantenha o estilo e tom original.
                
                Texto original: ${texto}

                Além da revisão, você deve:
                1. Criar um título atraente e em português que reflita fielmente o conteúdo
                2. Revisar o texto, melhorando ortografia, gramática e fluência
                3. Criar um resumo curto e impactante para redes sociais (máximo 200 caracteres)
                4. Sugerir hashtags relevantes para Instagram (máximo 5 hashtags, incluindo o símbolo # no início)
                5. Criar um prompt detalhado para gerar uma imagem que represente o conteúdo (o prompt deve ser em inglês e seguir estas regras:
                   - Não incluir nenhum texto ou palavras na imagem
                   - Criar uma composição visual impactante e profissional
                   - Usar cores vibrantes e contrastantes
                   - Focar em elementos visuais que representem o tema principal
                   - Garantir que a imagem seja adequada para notícias
                   - Evitar elementos polêmicos ou sensíveis
                   - Criar uma atmosfera que transmita a emoção da notícia)

                Formato da resposta:
                TÍTULO: [novo título]
                CONTEÚDO: [texto revisado]
                RESUMO: [resumo curto para redes sociais]
                HASHTAGS: #[hashtag1] #[hashtag2] #[hashtag3] #[hashtag4] #[hashtag5]
                IMAGE_PROMPT: [prompt detalhado em inglês para gerar a imagem, seguindo as regras acima]
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
            const conteudoRevisado = matchConteudo ? limparTextoMarkdown(matchConteudo[1].trim()) : '';
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
                        key: process.env.GEMINI_API_KEY || 'AIzaSyCaXdWOrkbUhJu8hukWYv5wlRZmHqLMkZ4'
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
            console.log('Conteúdo revisado:', conteudoRevisado);
            console.log('Resumo:', resumo);
            console.log('Hashtags:', hashtags);
            console.log('Image Prompt:', imagePrompt);
            console.log('Imagem URL:', imagemUrl);

            res.status(200).json({
                message: 'Texto revisado com sucesso!',
                data: {
                    titulo: novoTitulo,
                    conteudo: conteudoRevisado,
                    resumo: resumo,
                    hashtags: hashtags,
                    imagePrompt: imagePrompt,
                    imagemUrl: imagemUrl || null,
                    imagemBase64: imagemBase64 || null
                }
            });
        } catch (error) {
            console.error('Erro ao revisar o texto:', error.response?.data || error.message);
            res.status(500).json({
                message: 'Erro ao revisar o texto',
                error: error.response?.data?.error || error.message
            });
        }
    });
}