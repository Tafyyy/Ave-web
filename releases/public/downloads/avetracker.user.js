// ==UserScript==
// @name         AVETRACKER Yandex Music Tracker
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Автоматический трекер играющих треков из Яндекс Музыки для AVETRACKER Hub
// @author       Tafyyy
// @match        https://music.yandex.ru/*
// @match        https://music.yandex.com/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // Адрес вашего сервера на Render
    const HUB_URL = "https://avetracker-hub.onrender.com/api/update-track";

    // Получаем токен из памяти
    let token = GM_getValue('avetracker_token', '');

    function setupToken() {
        const input = prompt('Введите ваш личный токен из кабинета AVETRACKER Hub:', token);
        if (input && input.trim() !== '') {
            token = input.trim();
            GM_setValue('avetracker_token', token);
            alert('✅ Токен успешно сохранен!');
        } else {
            alert('❌ Токен не может быть пустым!');
        }
    }

    // Регистрация команды в меню Tampermonkey
    GM_registerMenuCommand('🔑 Изменить токен AVETRACKER', setupToken);

    // Если токена нет, сразу запрашиваем
    if (!token) {
        setupToken();
    }

    // Создание плавающей кнопки для смены токена прямо на странице
    function addTokenButton() {
        if (document.getElementById('ave-token-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'ave-token-btn';
        btn.innerHTML = '🔑 AVETRACKER';
        btn.style.cssText = `
            position: fixed;
            bottom: 25px;
            right: 25px;
            z-index: 999999;
            background: #9146ff;
            color: #ffffff;
            padding: 8px 14px;
            border-radius: 20px;
            font-family: sans-serif;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.6);
            user-select: none;
            transition: transform 0.2s, background 0.2s;
        `;

        btn.onmouseover = () => { btn.style.background = '#772ce8'; btn.style.transform = 'scale(1.05)'; };
        btn.onmouseout = () => { btn.style.background = '#9146ff'; btn.style.transform = 'scale(1)'; };
        btn.onclick = setupToken;

        document.body.appendChild(btn);
    }

    let lastSentTrack = '';

    setInterval(() => {
        addTokenButton();
        if (!token) return;

        try {
            if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
                const metadata = navigator.mediaSession.metadata;
                const title = metadata.title;
                const artist = metadata.artist;

                if (title && artist) {
                    const trackString = `${artist} — ${title}`;

                    if (trackString !== lastSentTrack) {
                        lastSentTrack = trackString;
                        console.log('🎵 Отправка трека:', trackString);

                        GM_xmlhttpRequest({
                            method: "POST",
                            url: HUB_URL,
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${token}`
                            },
                            data: JSON.stringify({ track: trackString }),
                            onload: function(res) {
                                if (res.status === 200 || res.status === 201) {
                                    console.log('✅ Трек успешно доставлен на сервер!');
                                } else if (res.status === 401) {
                                    alert('AVETRACKER: Токен недействителен!');
                                    GM_setValue('avetracker_token', '');
                                    setupToken();
                                }
                            },
                            onerror: function(err) {
                                console.error('❌ Ошибка отправки:', err);
                            }
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Ошибка в цикле медиа-сессии:', e);
        }
    }, 2000);
})();