const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

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

const ADMIN_SECRET_KEY = 'my_super_secret_admin_key_777';
const TOKEN_SECRET = 'avetracker_eternal_secure_key_2026';

// Подключение к Supabase (PostgreSQL) через раздельные параметры
const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false }
});

// Инициализация таблицы в базе данных при старте сервера (с поддержкой активного и предыдущего токенов)
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
                last_updated TEXT
            );
        `);
        console.log('✅ Таблица пользователей в Supabase успешно инициализирована');
    } catch (err) {
        console.error('❌ Ошибка инициализации базы данных:', err);
    }
}
initDB();

const currentMusic = {};

// Генерация токена
function createSecureToken(userId, username, salt = 'v1') {
    const data = `${userId}|${username}\vert{}${salt}`;
    const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('hex').substring(0, 24);
    const encoded = Buffer.from(data).toString('base64url');
    return `ave_${encoded}_${hmac}`;
}

// Проверка токена (проверяет как active_token, так и previous_token в базе)
async function validateToken(token) {
    if (!token || !token.startsWith('ave_')) return null;
    
    // Сначала проверим криптографическую целостность
    const parts = token.split('_');
    if (parts.length !== 3) return null;
    
    try {
        const decoded = Buffer.from(parts[1], 'base64url').toString('utf8');
        const [userId, username, salt] = decoded.split('|');
        
        const expectedHmac = crypto.createHmac('sha256', TOKEN_SECRET).update(decoded).digest('hex').substring(0, 24);
        if (parts[2] !== expectedHmac) return null;

        // Дополнительно проверяем по базе данных, существует ли этот токен в active_token или previous_token
        const res = await pool.query(
            'SELECT * FROM users WHERE user_id = $1 AND (active_token = $2 OR previous_token = $2)',
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

// --- ГЛАВНАЯ СТРАНИЦА ---
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

                /* Боковая панель с инструкцией */
                .sidebar {
                    display: none;
                    background-color: #18181b;
                    border: 1px solid #2f2f35;
                    border-radius: 12px;
                    padding: 30px;
                    max-width: 480px;
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
                .step-text li { margin-bottom: 4px; }

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
                    <p>Вывод играющего трека из Яндекс Музыки прямо в ваш чат Twitch.</p>
                    
                    <div class="section">
                        <h2>Центр загрузок</h2>
                        <div>
                            <a href="/download/avetracker.exe" class="btn">Скачать AVETRACKER.exe</a>
                            <a href="/download/av