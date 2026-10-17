const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Настройка сессий
app.use(session({
    secret: 'avetracker_super_secret_session_key_123',
    resave: false,
    saveUninitialized: false
}));

// Настройки Twitch OAuth
const TWITCH_CLIENT_ID = 'ВАШ_TWITCH_CLIENT_ID';
const TWITCH_CLIENT_SECRET = 'ВАШ_TWITCH_CLIENT_SECRET';
const REDIRECT_URI = 'https://avetracker-hub.onrender.com/auth/twitch/callback';

// База данных пользователей в памяти
// Структура: { twitchId: { username, avatar, token } }
const usersDB = {};

// База данных для хранения текущих треков (channel -> track)
const currentMusic = {};

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
    const serverDomain = req.get('host'); // Автоматически определяет домен (например, ваш render-адрес или localhost)
    const protocol = req.protocol;
    const streamElementsCommand = `\$(customapi ${protocol}://${serverDomain}/api/track?channel=${user.username})`;

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>Личный кабинет - AVETRACKER</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: sans-serif; background: #0e0e10; color: #efeff1; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                .container { background: #18181b; border: 1px solid #2f2f35; border-radius: 12px; padding: 30px; max-width: 550px; width: 100%; text-align: left; }
                .profile-header { display: flex; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #2f2f35; padding-bottom: 15px; }
                .avatar { width: 60px; height: 60px; border-radius: 50%; margin-right: 15px; border: 2px solid #9146ff; }
                h2 { color: #fff; font-size: 22px; }
                .subtext { color: #adadb8; font-size: 13px; }
                label { display: block; color: #bf94ff; font-size: 13px; font-weight: bold; margin-bottom: 5px; margin-top: 15px; }
                input { width: 100%; background: #0e0e10; border: 1px solid #2f2f35; color: #efeff1; padding: 10px; border-radius: 6px; font-size: 14px; outline: none; }
                input:focus { border-color: #9146ff; }
                .actions { margin-top: 25px; display: flex; justify-content: space-between; align-items: center; }
                .btn { display: inline-block; background: #2f2f35; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; text-align: center; }
                .btn:hover { background: #3a3a42; }
                .btn-danger { background: #eb0400; }
                .btn-danger:hover { background: #c20300; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="profile-header">
                    <img src="${user.avatar}" alt="Avatar" class="avatar">
                    <div>
                        <h2>${user.username}</h2>
                        <span class="subtext">Авторизован через Twitch</span>
                    </div>
                </div>

                <label>Ваш защищенный токен (для приложения и скрипта):</label>
                <input type="text" value="${user.token}" readonly onclick="this.select();">

                <label>Команда для StreamElements (!трек):</label>
                <input type="text" value="${streamElementsCommand}" readonly onclick="this.select();">

                <div class="actions">
                    <a href="/" class="btn">На главную</a>
                    <a href="/logout" class="btn btn-danger">Выйти</a>
                </div>
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
            return res.status(400).send('Ошибка авторизации в Twitch.');
        }

        const userRes = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });
        const userData = await userRes.json();
        const twitchUser = userData.data[0];

        const userId = twitchUser.id;
        const username = twitchUser.login.toLowerCase();
        const avatar = twitchUser.profile_image_url;

        // Если пользователя еще нет — создаем профиль и генерируем уникальный токен
        if (!usersDB[userId]) {
            usersDB[userId] = {
                username: username,
                avatar: avatar,
                token: 'ave_' + crypto.randomBytes(24).toString('hex')
            };
        } else {
            // Обновляем аватарку/ник на случай изменений, но сохраняем старый токен
            usersDB[userId].username = username;
            usersDB[userId].avatar = avatar;
            if (!usersDB[userId].token) {
                usersDB[userId].token = 'ave_' + crypto.randomBytes(24).toString('hex');
            }
        }

        req.session.userId = userId;
        res.redirect('/dashboard');

    } catch (err) {
        console.error('OAuth Error:', err);
        res.status(500).send('Ошибка авторизации.');
    }
});

// --- API ДЛЯ ТРЕКЕРОВ И ЧАТА (С ЗАЩИТОЙ ПО ТОКЕНУ) ---

// Прием трека от приложения или расширения (требует Authorization: Bearer <token>)
app.post('/api/update-track', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const { track } = req.body;

    if (!token || !track) {
        return res.status(400).send('Bad request');
    }

    // Ищем пользователя по токену
    const user = Object.values(usersDB).find(u => u.token === token);
    if (!user) {
        return res.status(401).send('Unauthorized: Invalid token');
    }

    currentMusic[user.username] = track;
    res.send('OK');
});

// Публичный эндпоинт для StreamElements (отдает текущий трек по нику)
app.get('/api/track', (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).send('Missing channel');
    const track = currentMusic[channel.toLowerCase()] || 'Музыка не играет';
    res.send(track);
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