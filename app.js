import express from 'express';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { readdirSync } from 'fs';
import logger from 'morgan';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configuração da view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

// Rotas via arquivo Router
import indexRouter from './routes/index.js';
app.use('/', indexRouter);

// Carregamento dinâmico de controladores
const loadControllers = async (app) => {
  const controllersPath = path.join(__dirname, 'app/controllers');
  const controllerFiles = readdirSync(controllersPath);

  for (const file of controllerFiles) {
    if (file.endsWith('.js')) {
      const filePath = path.join(controllersPath, file);
      const controller = await import(pathToFileURL(filePath).href);
      if (typeof controller.default === 'function') {
        controller.default(app);
      }
    }
  }
};

// Chama a função para carregar controladores dinamicamente
await loadControllers(app);

export default app;
