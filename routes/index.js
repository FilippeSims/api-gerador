import { Router } from 'express';
import { readFile } from 'fs/promises';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const data = await readFile('public/dist/index.html', 'utf8');
    res.render('index', { content: data });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao ler o arquivo index.html');
  }
});

export default router;
