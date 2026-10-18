// ==UserScript==
// @name         AVETRACKER Yandex Music Tracker
// @namespace    http://tampermonkey.net/
// @version      4.9
// @description  Стабильный трекер для AVETRACKER Hub с защитой от двойного окна
// @author       Tafyyy
// @match        https://*.music.yandex.ru/*
// @match        https://music.yandex.ru/*
// @match        https://*.music.yandex.com/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    console.log("🚀 AVETRACKER: Скрипт успешно запущен!");

    const HUB_URL = "https://avetracker-hub.onrender.com/api/update-track";
    let token = GM_getValue('avetracker_token', '');
    let isPromptOpen = false;

    function setupToken() {
        if (isPromptOpen) return;
        isPromptOpen = true;

        // Сразу стираем токен в памяти и в хранилище, чтобы остановить любые другие запросы
        token = '';
        GM_setValue('avetracker_token', '');

        const input = prompt('AVETRACKER: Ваш токен недействителен или устарел.\nВведите актуальный токен из личного кабинета:', '');

        // Даем небольшую задержку перед снятием флага, чтобы все старые ответы успели проигнорироваться
        setTimeout(() => {
            isPromptOpen = false;
        }, 1000);

        if (input !== null) {
            const trimmed = input.trim();
            if (trimmed !== '') {
                token = trimmed;
                GM_setValue('avetracker_token', token);
                console.log('✅ Новый токен успешно сохранен!');
            } else {
                alert('❌ Токен не может быть пустым!');
            }
        }
    }

    GM_registerMenuCommand('🔑 Изменить токен AVETRACKER', setupToken);

    if (!token) {
        setupToken();
    }

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

let lastTrackSent = "";
    let lastIsPlaying = null;

    setInterval(() => {
        addTokenButton();

        if (!token || isPromptOpen) {
            return;
        }

        let currentTrack = null;
        let isPlaying = false;

        try {
            if ('mediaSession' in navigator) {
                if (navigator.mediaSession.playbackState === 'playing') {
                    isPlaying = true;
                }
            }

            if (navigator.mediaSession && navigator.mediaSession.metadata) {
                const metadata = navigator.mediaSession.metadata;
                if (metadata.title && metadata.artist) {
                    currentTrack = `${metadata.artist} — ${metadata.title}`;
                }
            }
        } catch (e) {
            console.error("Ошибка чтения статуса плеера:", e);
        }

        // Логика отправки только при изменении состояния (трека или статуса воспроизведения)
        let trackPayload = null;

        if (isPlaying && currentTrack) {
            trackPayload = currentTrack;
        } else {
            trackPayload = "Музыка на паузе";
        }

        // Шлем запрос на сервер ТОЛЬКО если состояние реально изменилось
        if (isPlaying !== lastIsPlaying || (isPlaying && trackPayload !== lastTrackSent)) {
            lastIsPlaying = isPlaying;
            lastTrackSent = trackPayload;

            console.log("📡 Отправка статуса:", trackPayload);

            GM_xmlhttpRequest({
                method: "POST",
                url: HUB_URL,
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                data: JSON.stringify({ track: trackPayload }),
                onload: function(res) {
                    if (res.status === 401 && !isPromptOpen && token !== '') {
                        console.warn('⚠️ Токен отклонен сервером (401)');
                        setupToken();
                    }
                },
                onerror: function(err) {
                    console.error('❌ Ошибка сети:', err);
                }
            });
        }
    }, 3000);

})();