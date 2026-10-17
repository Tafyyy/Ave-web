const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Настройка сессий
app.use(session({
    secret: 'avetracker_super_secret_session_key_123',
    resave: false,
    saveUninitialized: false
}));

// Настройки Twitch OAuth (замените на свои данные)
const TWITCH_CLIENT_ID = 'e2g9rcwz8ti2ivthv2g64tyziqel21';
const TWITCH_CLIENT_SECRET = '4xnnc64vn27lvjlq1436ivp6qhji6d';
const REDIRECT_URI = 'https://avetracker-hub.onrender.com/auth/twitch/callback'; // Или http://localhost:3000/... для тестов

// Временная база данных пользователей в памяти
// Структура: { twitchId: { username, avatar } }
const usersDB = {};

// --- МАРШРУТЫ САЙТА ---

// Главная страница
app.get('/', (req, res) => {
    const isLogged = req.session.userId ? true : false;
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>AVETRACKER — Главная</title>
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
                h1 { color: #9146ff; font-size: 32px; margin-bottom: 10px; }
                p { color: #adadb8; font-size: 15px; line-height: 1.6; margin-bottom: 25px; }
                .section { margin-top: 30px; padding-top: 25px; border-top: 1px solid #2f2f35; }
                .section h2 { font-size: 18px; margin-bottom: 15px; color: #ffffff; }
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
                    transition: background 0.2s;
                }
                .btn:hover { background-color: #772ce8; }
                .btn-secondary { background-color: #2f2f35; color: #efeff1; }
                .btn-secondary:hover { background-color: #3a3a42; }
                .badge {
                    display: inline-block; background: rgba(145, 70, 255, 0.15);
                    color: #bf94ff; padding: 4px 10px; border-radius: 12px;
                    font-size: 12px; font-weight: 600; margin-bottom: 15px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <span class="badge">AVETRACKER Hub v2.0</span>
                <h1>AVETRACKER</h1>
                <p>Вывод играющего трека из Яндекс Музыки прямо в ваш чат Twitch.</p>
                
                <div class="section">
                    <h2>Центр загрузок</h2>
                    <a href="/download/avetracker.exe" class="btn">Скачать AVETRACKER.exe</a>
                    <a href="/download/avetracker.user.js" class="btn btn-secondary">Установить UserScript</a>
                </div>

                <div class="section">
                    <h2>Личный кабинет стримера</h2>
                    ${isLogged ? 
                        `<a href="/dashboard" class="btn">Перейти в личный кабинет</a>` : 
                        `<a href="/auth/twitch" class="btn" style="background: #9146FF;">Войти через Twitch</a>`
                    }
                </div>
            </div>
        </body>
        </html>
    `);
});

// Личный кабинет
app.get('/dashboard', (req, res) => {
    if (!req.session.userId || !usersDB[req.session.userId]) {
        return res.redirect('/');
    }

    const user = usersDB[req.session.userId];

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>Личный кабинет - AVETRACKER</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: sans-serif; background: #0e0e10; color: #efeff1; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                .container { background: #18181b; border: 1px solid #2f2f35; border-radius: 12px; padding: 40px; max-width: 500px; width: 100%; text-align: center; }
                .avatar { width: 80px; height: 80px; border-radius: 50%; margin-bottom: 15px; border: 2px solid #9146ff; }
                h2 { color: #fff; margin-bottom: 5px; }
                p { color: #adadb8; font-size: 14px; margin-bottom: 20px; }
                .btn { display: inline-block; background: #2f2f35; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; }
                .btn:hover { background: #3a3a42; }
                .btn-danger { background: #eb0400; color: white; }
                .btn-danger:hover { background: #c20300; }
            </style>
        </head>
        <body>
            <div class="container">
                <img src="${user.avatar}" alt="Avatar" class="avatar">
                <h2>${user.username}</h2>
                <p>Авторизация через Twitch прошла успешно!</p>
                <hr style="border: 0; border-top: 1px solid #2f2f35; margin: 20px 0;">
                <p style="color: #bf94ff;">Здесь скоро появится ваш защищенный токен для программы и команды.</p>
                <br>
                <a href="/" class="btn" style="margin-right: 10px;">На главную</a>
                <a href="/logout" class="btn btn-danger">Выйти</a>
            </div>
        </body>
        </html>
    `);
});

// Выход из сессии
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// --- TWITCH OAUTH МАРШРУТЫ ---

app.get('/auth/twitch', (req, res) => {
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=user:read:email`;
    res.redirect(authUrl);
});

app.get('/auth/twitch/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect('/');

    try {
        // 1. Обмениваем код на access_token
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            })
        });
        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            return res.status(400).send('Ошибка авторизации в Twitch: не удалось получить токен.');
        }

        // 2. Запрашиваем данные профиля пользователя из Helix API
        const userRes = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });
        const userData = await userRes.json();
        const twitchUser = userData.data[0];

        const userId = twitchUser.id;
        const username = twitchUser.login;
        const avatar = twitchUser.profile_image_url;

        // 3. Сохраняем в базу данных
        usersDB[userId] = { username, avatar };

        // 4. Устанавливаем сессию
        req.session.userId = userId;
        res.redirect('/dashboard');

    } catch (err) {
        console.error('OAuth Error:', err);
        res.status(500).send('Внутренняя ошибка сервера при авторизации.');
    }
});

// --- СТАТИКА И СКАЧИВАНИЕ ФАЙЛОВ ---
app.use(express.static(path.join(__dirname, 'public')));

app.get(['/download/script', '/download/avetracker.user.js'], (req, res) => {
    const filePath = path.join(__dirname, 'public', 'downloads', 'avetracker.user.js');
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.sendFile(filePath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hub running on port ${PORT}`));