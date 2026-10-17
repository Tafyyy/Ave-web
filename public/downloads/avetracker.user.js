// ==UserScript==
// @name         Yandex Music StreamBridge (Twitch !трек)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Automatic transfer of the current track from Yandex Music to StreamElements bot on Twitch.
// @description:ru Автоматическая передача текущего трека из Яндекс Музыки в чат-бота StreamElements на Twitch.
// @author       Tafyyy
// @license      MIT
// @match        https://music.yandex.ru/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @downloadURL https://update.greasyfork.org/scripts/600440/Yandex%20Music%20StreamBridge%20%28Twitch%20%21%D1%82%D1%80%D0%B5%D0%BA%29.user.js
// @updateURL https://update.greasyfork.org/scripts/600440/Yandex%20Music%20StreamBridge%20%28Twitch%20%21%D1%82%D1%80%D0%B5%D0%BA%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // Адрес вашего сервера на Render
    const BACKEND_URL = 'https://avetracker-hub.onrender.com/api/update-track';

    // Получаем сохраненный ник из памяти браузера
    let channelName = GM_getValue('twitch_channel', '');

    // Функция для запроса ника у стримера
    function setupChannel() {
        const input = prompt('Введите ваш ник на Twitch для работы команды !трек:', channelName);
        if (input && input.trim() !== '') {
            channelName = input.trim().toLowerCase();
            GM_setValue('twitch_channel', channelName);
            alert('Ник успешно сохранен: ' + channelName);
        } else {
            alert('Ник не может быть пустым!');
        }
    }

    // Добавляем пункт «Изменить ник Twitch» в меню расширения (если захочется поменять)
    GM_registerMenuCommand('Изменить ник Twitch', setupChannel);

    // Если ник еще не вводился, сразу показываем окно настройки
    if (!channelName) {
        setupChannel();
    }

    let lastSentTrack = '';

    setInterval(() => {
        if (!channelName) return;

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
                            headers: { "Content-Type": "application/json" },
                            data: JSON.stringify({ channel: channelName, track: trackString }),
                            onload: function(res) {
                                console.log('[SE-Bridge] Трек отправлен для канала:', channelName);
                            }
                        });
                    }
                }
            }
        } catch (e) {}
    }, 2000);
})();