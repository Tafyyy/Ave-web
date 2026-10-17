const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'avetracker_super_secret_session_key_123',
    resave: false,
    saveUninitialized: false
}));

const TWITCH_CLIENT_ID = 'e2g9rcwz8ti2ivthv2g64tyziqel21';
const TWITCH_CLIENT_SECRET = '4xnnc64vn27lvjlq1436ivp6qhji6d';
const REDIRECT_URI = 'https://avetracker-hub.onrender.com/auth/twitch/callback';

// Секретный ключ для доступа к вашей админ-панели (можете изменить)
const ADMIN_SECRET_KEY = 'my_super_secret_admin_avekey_777';

// Файл базы данных пользователей
const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
    if (fs.existsSync(USERS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        } catch (e) {
            console.error('Ошибка чтения users.json:', e);
        }
    }
    return {};
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 4), 'utf8');
    } catch (e) {
        console.error('Ошибка записи users.json:', e);
    }
}

let usersDB = loadUsers();
const currentMusic = {};

// --- ГЛАВНАЯ СТРАНИЦА ---
app.get('/', (req, res) => {
    const isLogged = req.session.userId && usersDB[req.session.userId] ? true : false;

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
                <span class="badge">AVETRACKER Hub v2.4</span>
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

// --- ЛИЧНЫЙ КАБИНЕТ ---
app.get('/dashboard', (req, res) => {
    usersDB = loadUsers();
    if (!req.session.userId || !usersDB[req.session.userId]) {
        return res.redirect('/auth/twitch');
    }

    const user = usersDB[req.session.userId];
    const serverDomain = req.get('host');
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
                .avatar { width: 50px; height: 50px; border-radius: 50%; margin-right: 15px; border: 2px solid #9146ff; }
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
                    <img src="${user.avatar}" alt="Avatar" class="avatar">
                    <div>
                        <h2>${user.username}</h2>
                        <span class="subtext">Авторизован через Twitch</span>
                    </div>
                </div>

                <label>Ваш постоянный токен:</label>
                <div class="input-group">
                    <input type="password" id="tokenInput" value="${user.token}" readonly onclick="this.select();">
                    <button class="btn-toggle" onclick="toggleTokenVisibility()">👁️ Показать</button>
                </div>
                
                <div style="margin-top: 8px;">
                    <a href="/regenerate-token" class="btn" style="font-size: 11px; padding: 6px 12px; background: #3a3a42;" onclick="return confirm('Вы уверены? Старый токен перестанет работать в приложении и расширении!');">🔄 Сгенерировать новый токен</a>
                </div>

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

// --- СЕКРЕТНАЯ АДМИН-ПАНЕЛЬ ДЛЯ ВАС ---
app.get('/admin', (req, res) => {
    const key = req.query.key;
    if (key !== ADMIN_SECRET_KEY) {
        return res.status(403).send('<h1>403 Forbidden</h1><p>Неверный секретный ключ администратора.</p>');
    }

    usersDB = loadUsers();
    const serverDomain = req.get('host');
    const protocol = req.protocol;

    let usersRows = '';
    const userIds = Object.keys(usersDB);

    if (userIds.length === 0) {
        usersRows = '<tr><td colspan="4" style="text-align:center; color: #848494;">База данных пока пуста (никто еще не авторизовался).</td></tr>';
    } else {
        userIds.forEach((id, index) => {
            const u = usersDB[id];
            const cmd = `\$(customapi ${protocol}://${serverDomain}/api/track?channel=${u.username})`;
            usersRows += `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        <div style="display:flex; align-items:center; gap: 10px;">
                            <img src="${u.avatar}" width="30" height="30" style="border-radius:50%;">
                            <b>${u.username}</b><br><span style="font-size:11px; color:#848494;">ID: ${id}</span>
                        </div>
                    </td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <input type="password" id="adm_token_${id}" value="${u.token}" readonly style="background:#0e0e10; border:1px solid #2f2f35; color:#efeff1; padding:5px; border-radius:4px; width:220px; font-size:12px;" onclick="this.select();">
                            <button onclick="toggleAdminToken('${id}')" style="background:#2f2f35; border:none; color:#fff; padding:0 8px; border-radius:4px; cursor:pointer;">👁️</button>
                        </div>
                    </td>
                    <td>
                        <input type="text" value="${cmd}" readonly style="background:#0e0e10; border:1px solid #2f2f35; color:#efeff1; padding:5px; border-radius:4px; width:280px; font-size:11px;" onclick="this.select();">
                    </td>
                </tr>
            `;
        });
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>Админ-панель - AVETRACKER</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: sans-serif; background: #0e0e10; color: #efeff1; padding: 30px; }
                .container { max-width: 1000px; margin: 0 auto; background: #18181b; border: 1px solid #2f2f35; border-radius: 12px; padding: 25px; }
                h1 { color: #9146ff; margin-bottom: 20px; font-size: 24px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border-bottom: 1px solid #2f2f35; padding: 12px; text-align: left; font-size: 14px; }
                th { color: #bf94ff; font-size: 13px; }
                .badge { background: rgba(145, 70, 255, 0.15); color: #bf94ff; padding: 3px 8px; border-radius: 8px; font-size: 11px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Панель администратора AVETRACKER <span class="badge">База стримеров</span></h1>
                <p style="color: #adadb8; font-size: 13px; margin-bottom: 15px;">Здесь хранятся данные всех пользователей, которые вошли через Twitch. Вы можете скопировать токен или команду для настройки.</p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Стример</th>
                            <th>Постоянный токен</th>
                            <th>Команда StreamElements</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${usersRows}
                    </tbody>
                </table>
                <div style="margin-top: 20px;">
                    <a href="/" style="color: #9146ff; text-decoration: none; font-size: 14px;">← На главную сайта</a>
                </div>
            </div>

            <script>
                function toggleAdminToken(id) {
                    const input = document.getElementById('adm_token_' + id);
                    if (input.type === 'password') {
                        input.type = 'text';
                    } else {
                        input.type = 'password';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/regenerate-token', (req, res) => {
    usersDB = loadUsers();
    if (!req.session.userId || !usersDB[req.session.userId]) {
        return res.redirect('/');
    }
    usersDB[req.session.userId].token = 'ave_' + crypto.randomBytes(24).toString('hex');
    saveUsers(usersDB);
    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
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
        const avatar = twitchUser.profile_image_url;

        usersDB = loadUsers();

        if (!usersDB[userId]) {
            usersDB[userId] = {
                username: username,
                avatar: avatar,
                token: 'ave_' + crypto.randomBytes(24).toString('hex')
            };
        } else {
            usersDB[userId].username = username;
            usersDB[userId].avatar = avatar;
            if (!usersDB[userId].token) {
                usersDB[userId].token = 'ave_' + crypto.randomBytes(24).toString('hex');
            }
        }

        saveUsers(usersDB);
        req.session.userId = userId;
        res.redirect('/dashboard');

    } catch (err) {
        console.error('OAuth Error:', err);
        res.status(500).send('Ошибка авторизации.');
    }
});

// --- API ДЛЯ ТРЕКЕРОВ ---
app.post('/api/update-track', (req, res) => {
    usersDB = loadUsers();
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const { track } = req.body;

    if (!token || !track) return res.status(400).send('Bad request');

    const user = Object.values(usersDB).find(u => u.token === token);
    if (!user) return res.status(401).send('Unauthorized: Invalid token');

    currentMusic[user.username] = track;
    res.send('OK');
});

app.get('/api/track', (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).send('Missing channel');
    const track = currentMusic[channel.toLowerCase()] || 'Музыка не играет';
    res.send(track);
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