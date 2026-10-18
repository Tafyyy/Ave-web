// ==UserScript==
// @name         AVETRACKER Yandex Music Tracker
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Автоматический трекер играющих треков из Яндекс Музыки для AVETRACKER Hub
// @author       Tafyyy
// @match        https://music.yandex.ru/*
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
            if (token) {
                GM_setValue('avetracker_token', token.trim());
            }
        }
        return token;
    }

    // Создаем кнопку управления токеном на странице Яндекс Музыки
    function createTokenButton() {
        if (document.getElementById('avetracker-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'avetracker-btn';
        btn.innerText = '🔑 AVETRACKER Токен';
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 99999;
            background: #9146ff;
            color: white;
            border: none;
            padding: 8px 14px;
            border-radius: 8px;
            font-family: sans-serif;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            transition: background 0.2s;
        `;
        btn.onmouseover = () => btn.style.background = '#772ce8';
        btn.onmouseout = () => btn.style.background = '#9146ff';
        
        btn.onclick = () => {
            const currentToken = GM_getValue('avetracker_token', '');
            const newToken = prompt("Введите ваш личный токен из кабинета AVETRACKER Hub:", currentToken);
            if (newToken !== null) {
                const trimmed = newToken.trim();
                GM_setValue('avetracker_token', trimmed);
                alert(trimmed ? "✅ Токен успешно сохранен!" : "❌ Токен удален.");
            }
        };

        document.body.appendChild(btn);
    }

    // Запускаем создание кнопки после загрузки страницы
    setTimeout(createTokenButton, 2000);

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
                    alert("AVETRACKER: Токен недействителен или устарел! Обновите его с помощью кнопки на странице.");
                    GM_setValue('avetracker_token', ''); 
                }
            }
        });
    }

    let lastTrack = "";

    setInterval(() => {
        const titleEl = document.querySelector('.player-controls__track-title, .track__title');
        const artistEl = document.querySelector('.player-controls__track-artists, .track__artists');

        if (titleEl) {
            const title = titleEl.innerText.trim();
            const artist = artistEl ? artistEl.innerText.trim() : "";
            const currentTrack = artist ? `${artist} - ${title}` : title;

            if (currentTrack && currentTrack !== lastTrack) {
                lastTrack = currentTrack;
                sendTrack(currentTrack);
            }
        }
    }, 3000);

})();