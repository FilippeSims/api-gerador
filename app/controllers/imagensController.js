import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Função para converter base64 em arquivo (duplicada de geradorController para simplicidade)
const salvarImagemBase64 = async (base64String, titulo) => {
    try {
        // Criar diretório se não existir
        const diretorio = path.join(process.cwd(), 'public', 'imagens');
        console.log('Diretório para salvar imagem:', diretorio);
        
        if (!fs.existsSync(diretorio)) {
            console.log('Criando diretório de imagens...');
            fs.mkdirSync(diretorio, { recursive: true });
        }

        // Gerar nome do arquivo baseado no título ou timestamp se título não for útil
        const nomeBase = titulo && typeof titulo === 'string' && titulo.trim().length > 0 
            ? titulo.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50) 
            : 'imagem-gerada';
        const nomeArquivo = `${Date.now()}-${nomeBase}.jpg`;
        const caminhoArquivo = path.join(diretorio, nomeArquivo);
        console.log('Caminho completo do arquivo:', caminhoArquivo);

        // Remover o prefixo da string base64 se existir
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
        console.log('Tamanho do base64 recebido para salvar:', base64Data.length);
        
        // Converter base64 para buffer e salvar
        const buffer = Buffer.from(base64Data, 'base64');
        console.log('Tamanho do buffer para salvar:', buffer.length);
        
        await fs.promises.writeFile(caminhoArquivo, buffer);
        console.log('Arquivo de imagem salvo com sucesso!');

        // Verificar se o arquivo foi realmente criado
        if (fs.existsSync(caminhoArquivo)) {
            const stats = fs.statSync(caminhoArquivo);
            console.log('Arquivo salvo existe. Tamanho:', stats.size, 'bytes');
        } else {
            console.error('Arquivo não foi criado após a escrita!');
            throw new Error('Falha ao verificar a criação do arquivo.')
        }

        // Retornar URL completa
        const baseUrl = process.env.API_URL || 'http://localhost:3000'; // Certifique-se que API_URL está no .env
        const url = `${baseUrl}/imagens/${nomeArquivo}`;
        console.log('URL da imagem gerada:', url);
        return { url, base64: base64String }; // Retorna URL e base64 original
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
    app.post('/gerador-imagens', async (req, res) => {
        const { imagePrompt } = req.body; // Pegar imagePrompt do corpo da requisição

        if (!imagePrompt) {
            return res.status(400).json({ message: 'O campo imagePrompt é obrigatório.' });
        }

        try {
            console.log('Gerando imagem para o prompt:', imagePrompt);

            const geminiResponse = await axios({
                method: 'post',
                url: 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict',
                params: {
                    key: process.env.GEMINI_API_KEY // Usar chave da variável de ambiente
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

            console.log('Resposta da API Gemini recebida. Status:', geminiResponse.status);
            console.log('Resposta completa Gemini:', JSON.stringify(geminiResponse.data, null, 2));

            if (!geminiResponse.data || !geminiResponse.data.predictions || geminiResponse.data.predictions.length === 0) {
                console.error('Nenhuma predição encontrada na resposta da API Gemini.');
                return res.status(500).json({ message: 'Falha ao gerar imagem: Nenhuma predição retornada pela API.' });
            }

            const prediction = geminiResponse.data.predictions[0];
            const imagemBase64 = prediction.bytesBase64Encoded;

            if (!imagemBase64) {
                console.error('Campo bytesBase64Encoded não encontrado na predição:', prediction);
                return res.status(500).json({ message: 'Falha ao gerar imagem: Dados da imagem não encontrados na resposta da API.' });
            }

            console.log('Imagem base64 recebida da API Gemini.');

            // Formatar o base64 para ter o prefixo correto se necessário
            let base64Formatado = imagemBase64;
            if (!base64Formatado.startsWith('data:image/')) {
                base64Formatado = `data:image/jpeg;base64,${base64Formatado}`;
            }

            // Tentar salvar a imagem
            const resultadoSalvar = await salvarImagemBase64(base64Formatado, imagePrompt);

            if (!resultadoSalvar) {
                return res.status(500).json({ message: 'Falha ao salvar a imagem gerada.' });
            }

            console.log('Imagem salva com sucesso. URL:', resultadoSalvar.url);
            
            // Retornar sucesso com URL e base64
            res.status(200).json({
                message: 'Imagem gerada e salva com sucesso!',
                imagemUrl: resultadoSalvar.url,
                imagemBase64: resultadoSalvar.base64
            });

        } catch (error) {
            console.error('Erro geral no endpoint /gerador-imagens:', {
                message: error.message,
                stack: error.stack,
                response: error.response?.data,
                status: error.response?.status,
                config: error.config // Mostra a configuração da requisição que falhou
            });
            res.status(500).json({
                message: 'Erro interno ao gerar a imagem.',
                error: error.response?.data?.error || error.message
            });
        }
    });
}

