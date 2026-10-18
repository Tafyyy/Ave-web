// ==UserScript==
// @name         AVETRACKER Yandex Music Tracker
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Автоматический трекер играющих треков из Яндекс Музыки для AVETRACKER Hub
// @author       Tafyyy
// @match        https://music.yandex.ru/*
// @match        https://music.yandex.com/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    const HUB_URL = "https://avetracker-hub.onrender.com"; 

    function getToken() {
        let token = GM_getValue('avetracker_token', null);
        if (!token) {
            token = prompt("AVETRACKER: Введите ваш личный токен из кабинета:");
            if (token && token.trim()) {
                token = token.trim();
                GM_setValue('avetracker_token', token);
            }
        }
        return token;
    }

    // Создание фиксированной кнопки для смены токена в углу экрана
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

        btn.onclick = () => {
            const currentToken = GM_getValue('avetracker_token', '');
            const newToken = prompt("Введите ваш личный токен из кабинета AVETRACKER Hub:", currentToken);
            if (newToken !== null) {
                const trimmed = newToken.trim();
                GM_setValue('avetracker_token', trimmed);
                alert(trimmed ? "✅ Токен успешно сохранен!" : "❌ Токен очищен.");
            }
        };

        document.body.appendChild(btn);
    }

    function sendTrack(trackName) {
        const token = getToken();
        if (!token) return;

        GM_xmlhttpRequest({
            method: "POST",
            url: `${HUB_URL}/api/update-track`,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            data: JSON.stringify({ track: trackName }),
            onload: function(response) {
                if (response.status === 401) {
                    alert("AVETRACKER: Токен недействителен или был изменен в кабинете!");
                    GM_setValue('avetracker_token', '');
                }
            }
        });
    }

    let lastTrack = "";

    // Основной цикл проверки плеера
    setInterval(() => {
        addTokenButton(); // Гарантируем появление кнопки

        const titleEl = document.querySelector('.player-controls__track-title, .track__title, [class*="TrackTitle"]');
        const artistEl = document.querySelector('.player-controls__track-artists, .track__artists, [class*="TrackArtists"]');

        if (titleEl) {
            const title = titleEl.innerText.trim();
            const artist = artistEl ? artistEl.innerText.trim() : "";
            const currentTrack = artist ? `${artist} - ${title}` : title;

            if (currentTrack && currentTrack !== lastTrack) {
                lastTrack = currentTrack;
                sendTrack(currentTrack);
            }
        }
    }, 2000);

})();