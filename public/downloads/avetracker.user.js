// ==UserScript==
// @name         AVETRACKER Yandex Music Tracker
// @namespace    http://tampermonkey.net/
// @version      1.1
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

    // Получаем хост вашего хаба (автоматически или можно прописать жестко)
    const HUB_URL = "https://avetracker-hub.onrender.com"; 

    function getToken() {
        let token = GM_getValue('avetracker_token', null);
        if (!token) {
            token = prompt("Введите ваш личный токен из кабинета AVETRACKER Hub:");
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
                    alert("AVETRACKER: Токен недействителен или устарел! Обновите его на сайте.");
                    GM_setValue('avetracker_token', ''); // Сбрасываем неверный токен
                }
            }
        });
    }

    let lastTrack = "";

    // Интервал проверки играющего трека в интерфейсе Яндекс Музыки
    setInterval(() => {
        // Селекторы элементов названия трека и исполнителя в Яндекс Музыке
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