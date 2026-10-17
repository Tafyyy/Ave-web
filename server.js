const express = require('express');
const path = require('path');

const app = express();

// Подключаем папку public для раздачи статики
app.use(express.static(path.join(__dirname, 'public')));

// Эндпоинт для скачивания .exe файла
app.get('/download/exe', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'downloads', 'AVETRACKER.exe');
    res.download(filePath, 'AVETRACKER.exe', (err) => {
        if (err) {
            console.error('Ошибка при скачивании EXE:', err);
            res.status(404).send('Файл AVETRACKER.exe пока не загружен на сервер.');
        }
    });
});

// Эндпоинт для установки / скачивания UserScript
app.get('/download/script', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'downloads', 'avetracker.user.js');
    res.download(filePath, 'avetracker.user.js', (err) => {
        if (err) {
            console.error('Ошибка при скачивании скрипта:', err);
            res.status(404).send('Файл скрипта пока не загружен на сервер.');
        }
    });
});

// Главная страница
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AVETRACKER — Музыка Яндекс Музыки в чате Twitch</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background-color: #0e0e10;
                    color: #efeff1;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                }
                .container {
                    background-color: #18181b;
                    border: 1px solid #2f2f35;
                    border-radius: 12px;
                    padding: 40px;
                    max-width: 600px;
                    width: 100%;
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                }
                h1 {
                    color: #9146ff;
                    font-size: 32px;
                    margin-bottom: 10px;
                }
                p {
                    color: #adadb8;
                    font-size: 15px;
                    line-height: 1.6;
                    margin-bottom: 25px;
                }
                .section {
                    margin-top: 30px;
                    padding-top: 25px;
                    border-top: 1px solid #2f2f35;
                }
                .section h2 {
                    font-size: 18px;
                    margin-bottom: 15px;
                    color: #ffffff;
                }
                .btn {
                    display: inline-block;
                    background-color: #9146ff;
                    color: white;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: bold;
                    font-size: 14px;
                    margin: 8px 5px;
                    transition: background 0.2s, transform 0.1s;
                }
                .btn:hover {
                    background-color: #772ce8;
                    transform: translateY(-1px);
                }
                .btn-secondary {
                    background-color: #2f2f35;
                    color: #efeff1;
                }
                .btn-secondary:hover {
                    background-color: #3a3a42;
                }
                .badge {
                    display: inline-block;
                    background: rgba(145, 70, 255, 0.15);
                    color: #bf94ff;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                    margin-bottom: 15px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <span class="badge">AVETRACKER Hub v1.0</span>
                <h1>AVETRACKER</h1>
                <p>Современный инструмент для вывода играющего трека из Яндекс Музыки прямо в ваш чат Twitch через StreamElements.</p>
                
                <!-- Блок загрузок -->
                <div class="section">
                    <h2>Центр загрузок</h2>
                    <p>Выберите удобный формат для работы с трекером:</p>
                    <a href="/download/exe" class="btn">Скачать AVETRACKER.exe</a>
                    <a href="/download/script" class="btn btn-secondary">Установить UserScript</a>
                </div>

                <!-- Блок будущего личного кабинета -->
                <div class="section">
                    <h2>Личный кабинет стримера</h2>
                    <p>Здесь появится управление токенами и персональные настройки (в разработке).</p>
                    <a href="#" class="btn btn-secondary" style="opacity: 0.5; cursor: not-allowed;">Войти через Twitch (Скоро)</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});