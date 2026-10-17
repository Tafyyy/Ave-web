// ==UserScript==
// @name         Yandex Music StreamBridge (Twitch !трек)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Automatic transfer of the current track from Yandex Music to StreamElements bot on Twitch.
// @description:ru Автоматическая передача текущего трека из Яндекс Музыки в чат-бота StreamElements на Twitch.
// @author       Tafyyy
// @license      MIT
// @match        https://music.yandex.ru/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // Адрес вашего сервера-хаба на Render
    const BACKEND_URL = 'https://avetracker-hub.onrender.com/api/update-track';

    // Получаем сохраненный токен из памяти браузера (Tampermonkey)
    let userToken = GM_getValue('avetracker_token', '');

    // Функция для запроса токена у стримера
    function setupToken() {
        const input = prompt('Введите ваш персональный токен из личного кабинета AVETRACKER:', userToken);
        if (input && input.trim() !== '') {
            userToken = input.trim();
            GM_setValue('avetracker_token', userToken);
            alert('Токен успешно сохранен!');
        } else {
            alert('Токен не может быть пустым!');
        }
    }

    // Добавляем пункт «Изменить токен AVETRACKER» в меню расширения Tampermonkey
    GM_registerMenuCommand('Изменить токен AVETRACKER', setupToken);

    // Если токен еще не вводился, сразу показываем окно настройки
    if (!userToken) {
        setupToken();
    }

    let lastSentTrack = '';

    setInterval(() => {
        if (!userToken) return;

        try {
            if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
                const metadata = navigator.mediaSession.metadata;
                const title = metadata.title;
                const artist = metadata.artist;

                if (title && artist) {
                    const trackString = `${artist} — ${title}`;

                    if (trackString !== lastSentTrack) {
                        lastSentTrack = trackString;

                        GM_xmlhttpRequest({
                            method: "POST",
                            url: BACKEND_URL,
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": "Bearer " + userToken // Передаем токен для авторизации
                            },
                            data: JSON.stringify({ track: trackString }), // Никнейм определяется на сервере по токену
                            onload: function(res) {
                                console.log('[AVETRACKER] Трек успешно отправлен:', trackString);
                            },
                            onerror: function(err) {
                                console.error('[AVETRACKER] Ошибка отправки трека:', err);
                            }
                        });
                    }
                }
            }
        } catch (e) {}
    }, 2000);
})();