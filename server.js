const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const fs = require('fs');

const app = express();

if (fs.existsSync('/etc/secrets/.env')) {
    require('dotenv').config({ path: '/etc/secrets/.env' });
} else {
    require('dotenv').config();
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_session_key',
    resave: false,
    saveUninitialized: false
}));

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://avetracker-hub.onrender.com/auth/twitch/callback';

const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;
const TOKEN_SECRET = process.env.TOKEN_SECRET;

// ==========================================
// ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ SUPABASE (PostgreSQL)
// ==========================================
const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false }
});

// Инициализация таблицы пользователей при старте сервера
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                avatar TEXT,
                salt TEXT DEFAULT 'v1',
                active_token TEXT,
                previous_token TEXT,
                last_updated TEXT,
                lastfm_user TEXT
            );
        `);
        console.log('✅ Таблица пользователей в Supabase успешно инициализирована');
    } catch (err) {
        console.error('❌ Ошибка инициализации базы данных:', err);
    }
}
initDB();

const currentMusic = {};

// ==========================================
// КРИПТОГРАФИЯ И ТОКЕНЫ
// ==========================================

function createSecureToken(userId, username, salt = 'v1') {
    const data = `${userId}|${username}|${salt}`;
    const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('hex').substring(0, 24);
    const encoded = Buffer.from(data).toString('base64url');
    return `ave_${encoded}_${hmac}`;
}

async function validateToken(token) {
    if (!token || !token.startsWith('ave_')) return null;
    const parts = token.split('_');
    if (parts.length !== 3) return null;
    
    try {
        const decoded = Buffer.from(parts[1], 'base64url').toString('utf8');
        const [userId, username, salt] = decoded.split('|');
        
        const expectedHmac = crypto.createHmac('sha256', TOKEN_SECRET).update(decoded).digest('hex').substring(0, 24);
        if (parts[2] !== expectedHmac) return null;

        const res = await pool.query(
            'SELECT * FROM users WHERE user_id = $1 AND active_token = $2',
            [userId, token]
        );

        if (res.rows.length > 0) {
            return { userId, username, salt };
        }
    } catch (e) {
        return null;
    }
    return null;
}

function parseSecureToken(token) {
    if (!token || !token.startsWith('ave_')) return null;
    const parts = token.split('_');
    if (parts.length !== 3) return null;
    
    try {
        const decoded = Buffer.from(parts[1], 'base64url').toString('utf8');
        const [userId, username, salt] = decoded.split('|');
        
        const expectedHmac = crypto.createHmac('sha256', TOKEN_SECRET).update(decoded).digest('hex').substring(0, 24);
        if (parts[2] === expectedHmac) {
            return { userId, username, salt };
        }
    } catch (e) {
        return null;
    }
    return null;
}

function getCookies(req) {
    const list = {};
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.split('=');
        list[name.trim()] = decodeURIComponent(rest.join('='));
    });
    return list;
}

// Middleware для проверки токена через базу данных
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    try {
        const resDb = await pool.query(
            'SELECT user_id, username FROM users WHERE active_token = $1',
            [token]
        );

        if (resDb.rows.length === 0) {
            return res.sendStatus(401);
        }

        req.tokenData = {
            userId: resDb.rows[0].user_id,
            username: resDb.rows[0].username.toLowerCase()
        };

        next();
    } catch (err) {
        console.error('Ошибка проверки токена в middleware:', err);
        return res.sendStatus(500);
    }
};


// ==========================================
// МАРШРУТЫ САЙТА (FRONTEND)
// ==========================================

app.get('/', async (req, res) => {
    const cookies = getCookies(req);
    const tokenData = await validateToken(cookies.avetracker_token);
    const isLogged = req.session.userId || tokenData ? true : false;

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>AVETRACKER — Главная</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    background-color: #0e0e10; 
                    color: #efeff1; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    min-height: 100vh;
                    padding: 20px;
                }
                .main-wrapper {
                    display: flex;
                    gap: 20px;
                    max-width: 1100px;
                    width: 100%;
                    justify-content: center;
                    align-items: flex-start;
                    transition: all 0.3s ease;
                }
                .container { 
                    background-color: #18181b; 
                    border: 1px solid #2f2f35; 
                    border-radius: 12px; 
                    padding: 40px; 
                    max-width: 550px; 
                    width: 100%; 
                    text-align: center; 
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                    flex-shrink: 0;
                }
                h1 { color: #9146ff; font-size: 34px; margin-bottom: 12px; font-weight: 800; }
                p { color: #adadb8; font-size: 15px; line-height: 1.6; margin-bottom: 25px; }
                .section { margin-top: 25px; padding-top: 25px; border-top: 1px solid #2f2f35; }
                .section h2 { font-size: 18px; margin-bottom: 15px; color: #ffffff; }
                .btn { display: inline-block; background-color: #9146ff; color: white; padding: 12px 22px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 6px 4px; transition: background 0.2s; }
                .btn:hover { background-color: #772ce8; }
                .btn-secondary { background-color: #2f2f35; color: #efeff1; }
                .btn-secondary:hover { background-color: #3a3a42; }
                
                .info-link {
                    display: inline-block;
                    margin-top: 12px;
                    color: #bf94ff;
                    font-size: 13px;
                    text-decoration: none;
                    cursor: pointer;
                    transition: color 0.2s;
                }
                .info-link:hover { color: #ffffff; text-decoration: underline; }

                .sidebar {
                    display: none;
                    background-color: #18181b;
                    border: 1px solid #2f2f35;
                    border-radius: 12px;
                    padding: 30px;
                    max-width: 520px;
                    width: 100%;
                    text-align: left;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                    animation: fadeIn 0.3s ease;
                }
                .sidebar.active { display: block; }
                .sidebar h3 { color: #bf94ff; font-size: 18px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
                .sidebar-close { cursor: pointer; color: #adadb8; font-size: 20px; border: none; background: none; }
                .sidebar-close:hover { color: #fff; }
                .step-block { background: #0e0e10; border: 1px solid #2f2f35; border-radius: 8px; padding: 15px; margin-bottom: 12px; }
                .step-title { color: #fff; font-size: 14px; font-weight: bold; margin-bottom: 6px; }
                .step-text { color: #adadb8; font-size: 13px; line-height: 1.5; }
                .step-text ol { margin-left: 18px; }
                .step-text li { margin-bottom: 6px; }
                .step-text a { color: #bf94ff; text-decoration: underline; }
                .step-text a:hover { color: #ffffff; }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateX(10px); }
                    to { opacity: 1; transform: translateX(0); }
                }

                @media (max-width: 900px) {
                    .main-wrapper { flex-direction: column; align-items: center; }
                    .sidebar { max-width: 550px; }
                }
            </style>
        </head>
        <body>
            <div class="main-wrapper">
                <div class="container">
                    <h1>AVETRACKER</h1>
                    <p>Вывод играющего трека из Яндекс Музыки и Spotify прямо в ваш чат Twitch.</p>
                    
                    <div class="section">
                        <h2>Центр загрузок</h2>
                        <div>
                            <a href="https://github.com/Tafyyy/Ave-web/releases/latest/download/avetracker.exe" class="btn" target="_blank">Скачать AVETRACKER.exe</a>
                            <a href="https://github.com/Tafyyy/Ave-web/releases/latest/download/avetracker.user.js" class="btn btn-secondary" target="_blank">Установить UserScript</a>
                        </div>
                        <div>
                            <span class="info-link" onclick="toggleInstruction()">📖 Инструкция по установке и настройке</span>
                        </div>
                    </div>

                    <div class="section">
                        <h2>Личный кабинет стримера</h2>
                        ${isLogged ? `<a href="/dashboard" class="btn">Перейти в личный кабинет</a>` : `<a href="/auth/twitch" class="btn" style="background: #9146FF;">Войти через Twitch</a>`}
                    </div>
                </div>

                <div class="sidebar" id="instructionSidebar">
                    <h3>
                        <span>📖 Инструкция по установке</span>
                        <button class="sidebar-close" onclick="toggleInstruction()">✕</button>
                    </h3>

                    <div class="step-block">
                        <div class="step-title">🎧 Spotify (через Last.fm)</div>
                        <div class="step-text">
                            Укажите ваш никнейм Last.fm в Личном кабинете. Музыка из Spotify будет считываться автоматически 24/7 без запуска ПК-приложений.
                        </div>
                    </div>

                    <div class="step-block">
                        <div class="step-title">🌐 Яндекс Музыка (через ПК/браузер)</div>
                        <div class="step-text">
                            Используйте приложение .exe или UserScript, указав токен из Личного кабинета.
                        </div>
                    </div>

                    <div class="step-block">
                        <div class="step-title">🤖 Настройка бота в чате (StreamElements)</div>
                        <div class="step-text">
                            Создайте команду (например, <code>!трек</code>) в панели StreamElements и вставьте скопированную ссылку из Личного кабинета.
                        </div>
                    </div>
                </div>
            </div>

            <script>
                function toggleInstruction() {
                    const sidebar = document.getElementById('instructionSidebar');
                    sidebar.classList.toggle('active');
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/dashboard', async (req, res) => {
    const cookies = getCookies(req);
    let tokenData = await validateToken(cookies.avetracker_token);

    if (!req.session.userId && tokenData) {
        req.session.userId = tokenData.userId;
        req.session.username = tokenData.username;
        req.session.salt = tokenData.salt;
    }

    if (!req.session.userId) {
        return res.redirect('/auth/twitch');
    }

    const username = req.session.username;
    
    let token = '';
    let lastfmUser = '';
    try {
        const userRow = await pool.query('SELECT active_token, salt, lastfm_user FROM users WHERE user_id = $1', [req.session.userId]);
        if (userRow.rows.length > 0) {
            token = userRow.rows[0].active_token || '';
            req.session.salt = userRow.rows[0].salt || 'v1';
            lastfmUser = userRow.rows[0].lastfm_user || '';
        } else {
            const salt = req.session.salt || 'v1';
            token = createSecureToken(req.session.userId, username, salt);
            await pool.query('UPDATE users SET active_token = $1 WHERE user_id = $2', [token, req.session.userId]);
        }
    } catch (err) {
        console.error('Ошибка получения токена для кабинета:', err);
        token = createSecureToken(req.session.userId, username, req.session.salt || 'v1');
    }
    
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
                body { font-family: sans-serif; background: #0e0e10; color: #efeff1; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
                .container { background: #18181b; border: 1px solid #2f2f35; border-radius: 12px; padding: 30px; max-width: 550px; width: 100%; text-align: left; }
                .profile-header { display: flex; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #2f2f35; padding-bottom: 15px; }
                h2 { color: #fff; font-size: 22px; }
                .subtext { color: #adadb8; font-size: 13px; }
                label { display: block; color: #bf94ff; font-size: 13px; font-weight: bold; margin-bottom: 5px; margin-top: 15px; }
                .input-group { display: flex; gap: 8px; }
                input { flex: 1; background: #0e0e10; border: 1px solid #2f2f35; color: #efeff1; padding: 10px; border-radius: 6px; font-size: 14px; outline: none; }
                .btn-toggle { background: #2f2f35; border: 1px solid #3a3a42; color: #efeff1; padding: 0 14px; border-radius: 6px; cursor: pointer; font-size: 14px; }
                .btn-toggle:hover { background: #3a3a42; }
                .actions { margin-top: 25px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
                .btn { display: inline-block; background: #2f2f35; color: white; padding: 10px 15px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; text-align: center; border: none; cursor: pointer; }
                .btn:hover { background: #3a3a42; }
                .btn-danger { background: #eb0400; }
                .btn-danger:hover { background: #c20300; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="profile-header">
                    <div>
                        <h2>${username}</h2>
                        <span class="subtext">Авторизован через Twitch (Supabase DB)</span>
                    </div>
                </div>

                <label>Ваш постоянный токен (для ПК-приложения):</label>
                <div class="input-group">
                    <input type="password" id="tokenInput" value="${token}" readonly onclick="this.select();">
                    <button class="btn-toggle" onclick="toggleTokenVisibility()">👁️ Показать</button>
                </div>
                
                <div style="margin-top: 8px;">
                    <a href="/regenerate-token" class="btn" style="font-size: 11px; padding: 6px 12px; background: #3a3a42;" onclick="return confirm('Вы уверены? Старый токен перейдет в предыдущие, но старое приложение перестанет работать, пока вы не обновите токен там!');">🔄 Сгенерировать новый токен</a>
                </div>

                <form action="/api/save-lastfm" method="POST">
                    <label>Никнейм на Last.fm (для Spotify):</label>
                    <div class="input-group">
                        <input type="text" name="lastfm_user" value="${lastfmUser}" placeholder="Ваш профиль Last.fm">
                        <button type="submit" class="btn" style="background: #9146ff; color: #fff; margin:0;">Сохранить</button>
                    </div>
                </form>

                <label>Команда для StreamElements (!трек):</label>
                <input type="text" value="${streamElementsCommand}" readonly onclick="this.select();">

                <div class="actions">
                    <a href="/" class="btn">На главную</a>
                    <a href="/logout" class="btn btn-danger">Выйти</a>
                </div>
            </div>

            <script>
                function toggleTokenVisibility() {
                    const input = document.getElementById('tokenInput');
                    const btn = event.target;
                    if (input.type === 'password') {
                        input.type = 'text';
                        btn.textContent = '🙈 Скрыть';
                    } else {
                        input.type = 'password';
                        btn.textContent = '👁️ Показать';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

app.post('/api/save-lastfm', async (req, res) => {
    const cookies = getCookies(req);
    const tokenData = await validateToken(cookies.avetracker_token);
    
    if (!tokenData) {
        return res.status(401).send('Неавторизован');
    }

    let { lastfm_user } = req.body;
    lastfm_user = lastfm_user ? lastfm_user.trim() : null;

    try {
        await pool.query(
            'UPDATE users SET lastfm_user = $1 WHERE user_id = $2',
            [lastfm_user, tokenData.userId]
        );
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Ошибка сохранения Last.fm:', err);
        res.status(500).send('Ошибка сервера');
    }
});

app.get('/regenerate-token', async (req, res) => {
    if (!req.session.userId) {
        const cookies = getCookies(req);
        const tokenData = parseSecureToken(cookies.avetracker_token);
        if (tokenData) {
            req.session.userId = tokenData.userId;
            req.session.username = tokenData.username;
        }
    }

    if (!req.session.userId) {
        return res.redirect('/');
    }
    
    const newSalt = 'v_' + Date.now().toString(36);
    req.session.salt = newSalt;
    const newToken = createSecureToken(req.session.userId, req.session.username, newSalt);

    try {
        await pool.query(`
            UPDATE users 
            SET 
                previous_token = active_token,
                active_token = $1,
                salt = $2,
                last_updated = $3
            WHERE user_id = $4
        `, [newToken, newSalt, new Date().toLocaleString('ru-RU'), req.session.userId]);
    } catch (err) {
        console.error('Ошибка при пересоздании токена в базе:', err);
    }

    res.setHeader('Set-Cookie', `avetracker_token=${newToken}; Max-Age=${60*60*24*365}; Path=/; HttpOnly; Secure; SameSite=Lax`);
    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.setHeader('Set-Cookie', 'avetracker_token=; Max-Age=0; Path=/; HttpOnly; Secure');
        res.redirect('/');
    });
});


// ==========================================
// АВТОРИЗАЦИЯ ЧЕРЕЗ TWITCH (OAuth2)
// ==========================================
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
        const avatar = twitchUser.profile_image_url;

        let salt = 'v1';
        let existingToken = null;
        try {
            const existing = await pool.query('SELECT salt, active_token FROM users WHERE user_id = $1', [userId]);
            if (existing.rows.length > 0) {
                salt = existing.rows[0].salt || 'v1';
                existingToken = existing.rows[0].active_token;
            }
        } catch (err) {
            console.error('Ошибка проверки пользователя в базе:', err);
        }

        const permanentToken = existingToken || createSecureToken(userId, username, salt);

        try {
            await pool.query(
                `INSERT INTO users (user_id, username, avatar, salt, active_token, last_updated) 
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (user_id) 
                 DO UPDATE SET 
                    username = EXCLUDED.username, 
                    avatar = EXCLUDED.avatar, 
                    last_updated = EXCLUDED.last_updated`,
                [userId, username, avatar, salt, permanentToken, new Date().toLocaleString('ru-RU')]
            );
        } catch (err) {
            console.error('Ошибка записи при авторизации:', err);
        }

        req.session.userId = userId;
        req.session.username = username;
        req.session.salt = salt;

        res.setHeader('Set-Cookie', `avetracker_token=${permanentToken}; Max-Age=${60*60*24*365}; Path=/; HttpOnly; Secure; SameSite=Lax`);
        res.redirect('/dashboard');

    } catch (err) {
        console.error('OAuth Error:', err);
        res.status(500).send('Ошибка авторизации.');
    }
});


// ==========================================
// API ДЛЯ ПРИЛОЖЕНИЯ И ЧАТА
// ==========================================

app.post('/api/update-track', verifyToken, (req, res) => {
    let { track } = req.body;
    const username = req.tokenData.username;
    
    if (!track || track === "Музыка на паузе" || track === "Остановлено" || track === "Музыка не активна" || track === "Музыка не играет") {
        currentMusic[username] = "Музыка не играет";
    } else {
        currentMusic[username] = track;
    }
    
    console.log(`🎵 [UPDATE] Стример: ${username} | Трек: ${currentMusic[username]}`);
    res.json({ success: true });
});

app.get('/api/track', (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).send('Missing channel');
    const track = currentMusic[channel.toLowerCase()] || 'Музыка не играет';
    res.send(track);
});

app.get('/api/ping', (req, res) => {
    res.status(200).send('PONG');
});


// ==========================================
// ФОНОВЫЙ ОПРОС LAST.FM (ДЛЯ СПОТИФАЙ)
// ==========================================
async function pollLastFm() {
    try {
        const res = await pool.query("SELECT username, lastfm_user FROM users WHERE lastfm_user IS NOT NULL AND lastfm_user != ''");
        
        // Показываем в логах, сколько аккаунтов Last.fm нашел сервер в БД
        if (res.rows.length === 0) {
            console.log('⚠️ [LAST.FM] В базе нет пользователей с заполненным lastfm_user!');
            return;
        }

        for (const row of res.rows) {
            const username = row.username.toLowerCase();
            const lfmUser = row.lastfm_user.trim();
            
            console.log(`🔎 [LAST.FM CHECK] Проверяем Last.fm юзера: "${lfmUser}" для канала "${username}"...`);

            try {
                const url = `http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(lfmUser)}&api_key=2c6089c9ecc543c988feabb7935d8289&format=json&limit=1`;
                
                const response = await fetch(url);
                const data = await response.json();
                
                if (data.error) {
                    console.error(`❌ [LAST.FM API ERROR] Ошибка от Last.fm для "${lfmUser}": ${data.message}`);
                    continue;
                }

                let rawTracks = data.recenttracks ? data.recenttracks.track : null;
                if (!rawTracks) {
                    console.log(`⚠️ [LAST.FM] Треки не найдены для "${lfmUser}"`);
                    continue;
                }

                const tracks = Array.isArray(rawTracks) ? rawTracks : [rawTracks];

                if (tracks.length > 0) {
                    const latest = tracks[0];
                    const attr = latest['@attr'];
                    const isPlaying = attr && attr.nowplaying === 'true';
                    
                    if (isPlaying) {
                        const artist = (latest.artist && (latest.artist['#text'] || latest.artist.name)) || '';
                        const title = latest.name || '';
                        const trackStr = artist ? `${artist} — ${title}` : title;
                        
                        if (currentMusic[username] !== trackStr) {
                            currentMusic[username] = trackStr;
                            console.log(`🎵 [LAST.FM SUCCESS] Стример: ${username} | Трек: ${trackStr}`);
                        } else {
                            console.log(`ℹ️ [LAST.FM SAME] Трек не изменился: ${trackStr}`);
                        }
                    } else {
                        console.log(`⏸️ [LAST.FM IDLE] В данный момент ничего не играет у "${lfmUser}"`);
                    }
                }
            } catch (err) {
                console.error(`❌ [LAST.FM FETCH ERROR] Ошибка запроса к Last.fm (${lfmUser}):`, err.message);
            }
        }
    } catch (err) {
        console.error('❌ [LAST.FM DB ERROR] Ошибка базы данных:', err.message);
    }
}

// Запускаем фоновый опрос каждые 10 секунд
setInterval(pollLastFm, 10000);


// ==========================================
// СТАТИКА И ЗАПУСК СЕРВЕРА
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Hub running on port ${PORT}`));