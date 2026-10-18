// ==UserScript==
// @name         AVETRACKER Yandex Music Tracker
// @namespace    http://tampermonkey.net/
// @version      4.3
// @description  Диагностический трекер для Яндекс Музыки
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

    console.log("🚀 AVETRACKER: Скрипт успешно запущен на странице!");

    const HUB_URL = "https://avetracker-hub.onrender.com/api/update-track";
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

    GM_registerMenuCommand('🔑 Изменить токен AVETRACKER', setupToken);
    if (!token) setupToken();

    function addTokenButton() {
        if (document.getElementById('ave-token-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'ave-token-btn';
        btn.innerHTML = '🔑 AVETRACKER';
        btn.style.cssText = `
            position: fixed; bottom: 25px; right: 25px; z-index: 999999;
            background: #9146ff; color: #ffffff; padding: 8px 14px;
            border-radius: 20px; font-family: sans-serif; font-size: 12px;
            font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.6);
        `;
        btn.onclick = setupToken;
        document.body.appendChild(btn);
    }

    let lastSentTrack = '';

    setInterval(() => {
        addTokenButton();
        if (!token) return;

        let currentTrack = "Ничего не играет";

        try {
            if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
                const metadata = navigator.mediaSession.metadata;
                if (metadata.title && metadata.artist) {
                    currentTrack = `${metadata.artist} — ${metadata.title}`;
                }
            }
        } catch (e) {
            console.error("Ошибка чтения mediaSession:", e);
        }

        // Запасной вариант: если mediaSession пуст, пробуем вытащить текст из DOM заголовка страницы или плеера
        if (currentTrack === "Ничего не играет") {
            const pageTitle = document.title; // Обычно содержит "Трек — Исполнитель | Яндекс Музыка"
            if (pageTitle && pageTitle.includes(" — ")) {
                currentTrack = pageTitle.split(" — Яндекс Музыка")[0].trim();
            }
        }

        console.log("🎵 Текущий статус трека:", currentTrack);

        // Отправляем запрос на сервер каждые 5 секунд
        GM_xmlhttpRequest({
            method: "POST",
            url: HUB_URL,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            data: JSON.stringify({ track: currentTrack }),
            onload: function(res) {
                console.log("📡 Ответ сервера:", res.status, res.responseText);
                if (res.status === 401) {
                    console.warn('⚠️ AVETRACKER: Токен недействителен!');
                    GM_setValue('avetracker_token', '');
                    setupToken();
                }
            },
            onerror: function(err) {
                console.error('❌ Ошибка соединения с сервером:', err);
            }
        });
    }, 5000);

})();