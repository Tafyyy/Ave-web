// ==UserScript==
// @name         AVETRACKER Yandex Music Tracker
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Автоматический трекер играющих треков из Яндекс Музыки для AVETRACKER Hub
// @author       Tafyyy
// @match        https://music.yandex.ru/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // Хост вашего хаба на Render
    const HUB_URL = "https://avetracker-hub.onrender.com"; 

    // Функция запроса и сохранения токена через меню
    function setTokenManually() {
        const currentToken = GM_getValue('avetracker_token', '');
        const newToken = prompt("Введите ваш личный токен из кабинета AVETRACKER Hub:", currentToken);
        if (newToken !== null) {
            const trimmed = newToken.trim();
            GM_setValue('avetracker_token', trimmed);
            alert(trimmed ? "✅ Токен успешно сохранен!" : "❌ Токен удален.");
        }
    }

    // Добавляем пункт в меню расширения Tampermonkey
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand("🔑 Указать/Изменить токен AVETRACKER", setTokenManually);
    }

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
                    alert("AVETRACKER: Токен недействителен или устарел! Обновите его через меню расширения.");
                    GM_setValue('avetracker_token', ''); // Сбрасываем неверный токен
                }
            }
        });
    }

    let lastTrack = "";

    // Интервал проверки играющего трека в Яндекс Музыке
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