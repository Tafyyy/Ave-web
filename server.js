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
const TWITCH_CLIENT_ID = 'e2g9rcwz8ti2ivthv2g64tyziqel21';
const TWITCH_CLIENT_SECRET = '4xnnc64vn27lvjlq1436ivp6qhji6d';
const REDIRECT_URI = 'https://avetracker-hub.onrender.com/auth/twitch/callback';

// Секретный ключ для криптографической подписи токенов (не меняйте его, иначе токены сбросятся)
const TOKEN_SECRET = 'avetracker_secure_hmac_secret_key_999';

const currentMusic = {};

// --- КРИПТОГРАФИЧЕСКИЕ ТОКЕНЫ (Без баз данных и файлов) ---

// Генерация постоянного токена, в который зашит userId и username
function generateToken(userId, username) {
    const payload = `${userId}:${username}`;
    const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex').substring(0, 24);
    return `ave_${userId}_${hmac}`;
}

// Проверка и расшифровка токена
function verifyToken(token) {
    if (!token || !token.startsWith('ave_')) return null;
    const parts = token.split('_');
    if (parts.length < 3) return null;
    
    const userId = parts[1];
    
    // Нам нужно найти пользователя по userId (восстанавливаем из токена)
    // Но так как у нас нет базы, проверим подпись со всеми известными никами или восстановим из куки.
    // Упростим: зашием в токен формат ave_userId_username_hmac
    return null; // используем расширенный формат ниже
}

// Надежный генератор с зашифрованным ником
function createSecureToken(userId, username) {
    const data = `${userId}|${username}`;
    const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('hex').substring(0, 20);
    // Кодируем в base64url чтобы избежать проблем с символами
    const encoded = Buffer.from(data).toString('base64url');
    return `ave_${encoded}_${hmac}`;
}

function parseSecureToken(token) {
    if (!token || !token.startsWith('ave_')) return null;
    const parts = token.split('_');
    if (parts.length !== 3) return null;
    
    const encoded = parts[1];
    const receivedHmac = parts[2];
    
    try {
        const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
        const [userId, username] = decoded.split('|');
        
        // Проверяем подпись
        const expectedHmac = crypto.createHmac('sha256', TOKEN_SECRET).update(decoded).digest('hex').substring(0, 20);
        if (receivedHmac === expectedHmac) {
            return { userId, username };
        }
    } catch (e) {
        return null;
    }
    return null;
}

// Вспомогательная функция чтения кук из запроса
function getCookies(req) {
    const list = {};
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return list;
    cookieHeader.split(`;`).forEach(cookie => {
        const [name, ...rest] = cookie.split(`=`);
        list[name.trim()] = decodeURIComponent(rest.join(`=`));
    });
    return list;
}

// --- МАРШРУТЫ САЙТА ---

app.get('/', (req, res) => {
    // Проверяем сессию или куки
    const cookies = getCookies(req);
    const tokenData = parseSecureToken(cookies.avetracker_token);
    const isLogged = req.session.userId || tokenData ? true : false;

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>AVETRACKER — Главная</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: sans-serif; background-color: #0e0e10; color: #efeff1; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                .container { background-color: #18181b; border: 1px solid #2f2f35; border-radius: 12px; padding: 40px; max-width: 600px; width: 100%; text-align: center; }
                h1 { color: #9146ff; font-size: 32px; margin-bottom: 10px; }
                p { color: #adadb8; font-size: 15px; line-height: 1.6; margin-bottom: 25px; }
                .section { margin-top: 30px; padding-top: 25px; border-top: 1px solid #2f2f35; }
                .section h2 { font-size: 18px; margin-bottom: 15px; color: #ffffff; }
                .btn { display: inline-block; background-color: #9146ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; margin: 8px 5px; }
                .btn:hover { background-color: #772ce8; }
                .btn-secondary { background-color: #2f2f35; color: #efeff1; }
                .badge { display: inline-block; background: rgba(145, 70, 255, 0.15); color: #bf94ff; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-bottom: 15px; }
            </style>
        </head>
        <body>
            <div class="container">
                <span class="badge">AVETRACKER Hub v2.2</span>
                <h1>AVETRACKER</h1>
                <p>Вывод играющего трека из Яндекс Музыки прямо в ваш чат Twitch.</p>
                <div class="section">
                    <h2>Центр загрузок</h2>
                    <a href="/download/avetracker.exe" class="btn">Скачать AVETRACKER.exe</a>
                    <a href="/download/avetracker.user.js" class="btn btn-secondary">Установить UserScript</a>
                </div>
                <div class="section">
                    <h2>Личный кабинет стримера</h2>
                    ${isLogged ? `<a href="/dashboard" class="btn">Перейти в личный кабинет</a>` : `<a href="/auth/twitch" class="btn" style="background: #9146FF;">Войти через Twitch</a>`}
                </div>
            </div>
        </body>
        </html>
    `);
});

// Личный кабинет с автоматическим восстановлением сессии из куки
app.get('/dashboard', (req, res) => {
    const cookies = getCookies(req);
    
    // Если сессия пустая, но есть защищенный токен в куках — автоматически восстанавливаем сессию!
    if (!req.session.userId && cookies.avetracker_token) {
        const tokenData = parseSecureToken(cookies.avetracker_token);
        if (tokenData) {
            req.session.userId = tokenData.userId;
            req.session.username = tokenData.username;
        }
    }

    if (!req.session.userId) {
        return res.redirect('/auth/twitch');
    }

    const username = req.session.username;
    const token = cookies.avetracker_token;
    const serverDomain = req.get('host');
    const protocol = req.protocol;
    const streamElementsCommand = `\$(customapi ${protocol}://${serverDomain}/api/track?channel=${username})`;

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
                h2 { color: #fff; font-size: 22px; }
                .subtext { color: #adadb8; font-size: 13px; }
                label { display: block; color: #bf94ff; font-size: 13px; font-weight: bold; margin-bottom: 5px; margin-top: 15px; }
                input { width: 100%; background: #0e0e10; border: 1px solid #2f2f35; color: #efeff1; padding: 10px; border-radius: 6px; font-size: 14px; outline: none; }
                .actions { margin-top: 25px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
                .btn { display: inline-block; background: #2f2f35; color: white; padding: 10px 15px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; text-align: center; border: none; cursor: pointer; }
                .btn:hover { background: #3a3a42; }
                .btn-primary { background: #9146ff; }
                .btn-primary:hover { background: #772ce8; }
                .btn-danger { background: #eb0400; }
                .btn-danger:hover { background: #c20300; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="profile-header">
                    <div>
                        <h2>${username}</h2>
                        <span class="subtext">Авторизован через Twitch (Постоянный токен)</span>
                    </div>
                </div>

                <label>Ваш постоянный защищенный токен:</label>
                <input type="text" value="${token}" readonly onclick="this.select();">
                <p style="color: #848494; font-size: 11px; margin-top: 5px;">Этот токен никогда не изменится и не сбросится при перезагрузке сервера.</p>

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

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        // Удаляем куку с токеном при выходе
        res.setHeader('Set-Cookie', 'avetracker_token=; Max-Age=0; Path=/; HttpOnly; Secure');
        res.redirect('/');
    });
});

// --- TWITCH OAUTH ---

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
        if (!tokenData.access_token) return res.status(400).send('Ошибка авторизации в Twitch.');

        const userRes = await fetch('https://api.twitch.tv/helix/users', {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const userData = await userRes.json();
        const twitchUser = userData.data[0];

        const userId = twitchUser.id;
        const username = twitchUser.login.toLowerCase();

        // Создаем постоянный крипто-токен
        const permanentToken = createSecureToken(userId, username);

        // Сохраняем сессию
        req.session.userId = userId;
        req.session.username = username;

        // Сохраняем токен в долгую куку браузера (на 1 год)
        res.setHeader('Set-Cookie', `avetracker_token=${permanentToken}; Max-Age=${60*60*24*365}; Path=/; HttpOnly; Secure; SameSite=Lax`);
        res.redirect('/dashboard');

    } catch (err) {
        console.error('OAuth Error:', err);
        res.status(500).send('Ошибка авторизации.');
    }
});

// --- API ДЛЯ ТРЕКЕРОВ ---

app.post('/api/update-track', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const { track } = req.body;

    if (!token || !track) return res.status(400).send('Bad request');

    // Проверяем токен математически (без баз данных)
    const tokenData = parseSecureToken(token);
    if (!tokenData) return res.status(401).send('Unauthorized: Invalid token');

    currentMusic[tokenData.username] = track;
    res.send('OK');
});

app.get('/api/track', (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).send('Missing channel');
    const track = currentMusic[channel.toLowerCase()] || 'Музыка не играет';
    res.send(track);
});

// Endpoint для предотвращения засыпания (Keep-Alive пинг)
app.get('/api/ping', (req, res) => {
    res.status(200).send('PONG');
});

// --- СТАТИКА ---
app.use(express.static(path.join(__dirname, 'public')));

app.get(['/download/script', '/download/avetracker.user.js'], (req, res) => {
    const filePath = path.join(__dirname, 'public', 'downloads', 'avetracker.user.js');
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.sendFile(filePath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hub running on port ${PORT}`));