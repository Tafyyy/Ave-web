import urllib.request
import json
import threading
import time
import asyncio
import os
import tkinter as tk
from tkinter import messagebox
from PIL import Image, ImageDraw
import pystray

try:
    import winsdk.windows.media.control as wmc
    HAS_WINSDK = True
except ImportError:
    HAS_WINSDK = False

CONFIG_FILE = "config.json"

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {
        "twitch_channel": "", 
        "backend_url": "https://yandex-music-api.onrender.com/api/update-track", 
        "update_interval_sec": 5
    }

def save_config(channel):
    config = {
        "twitch_channel": channel.strip().lower(),
        "backend_url": "https://yandex-music-api.onrender.com/api/update-track",
        "update_interval_sec": 5
    }
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=4)
    return config

tracking_active = False
last_track = ""

async def get_windows_media():
    if not HAS_WINSDK:
        return None
    try:
        manager = await wmc.GlobalSystemMediaTransportControlsSessionManager.request_async()
        sessions = manager.get_sessions()
        
        # Сначала ищем то, что прямо сейчас играет
        for session in sessions:
            info = session.get_playback_info()
            if info and info.playback_status == wmc.GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING:
                props = await session.try_get_media_properties_async()
                if props and props.title:
                    title = props.title
                    artist = props.artist
                    if title:
                        if artist:
                            return f"{artist} — {title}"
                        return title
                        
        # Запасной вариант через текущую сессию
        session = manager.get_current_session()
        if session:
            props = await session.try_get_media_properties_async()
            if props and props.title:
                title = props.title
                artist = props.artist
                if title:
                    if artist:
                        return f"{artist} — {title}"
                    return title
    except Exception:
        pass
    return None

def send_track_to_backend(channel_name, track_name):
    global last_track
    if not track_name or track_name == last_track:
        return
    last_track = track_name
    try:
        data = json.dumps({"channel": channel_name, "track": track_name}).encode('utf-8')
        req = urllib.request.Request(
            "https://yandex-music-api.onrender.com/api/update-track",
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            pass
    except Exception as e:
        print(f"Send Error: {e}")

def background_worker(channel_name, status_callback):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    global tracking_active
    while tracking_active:
        if HAS_WINSDK:
            try:
                track = loop.run_until_complete(get_windows_media())
                if track:
                    send_track_to_backend(channel_name, track)
                    status_callback(f"Играет: {track}")
                else:
                    status_callback("Статус: Ожидание музыки...")
            except Exception:
                pass
        time.sleep(5)

class AveTrackerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("AVETRACKER")
        self.root.geometry("400x260")
        self.root.resizable(False, False)
        
        self.config_data = load_config()
        self.icon = None
        
        title_lbl = tk.Label(root, text="AVETRACKER", font=("Arial", 14, "bold"))
        title_lbl.pack(pady=15)
        
        frame = tk.Frame(root)
        frame.pack(pady=5)
        
        lbl = tk.Label(frame, text="Ник на Twitch:", font=("Arial", 10))
        lbl.pack(side=tk.LEFT, padx=5)
        
        self.entry = tk.Entry(frame, font=("Arial", 10), width=22)
        self.entry.pack(side=tk.LEFT, padx=5)
        if self.config_data.get("twitch_channel"):
            self.entry.insert(0, self.config_data["twitch_channel"])
            
        self.btn = tk.Button(root, text="Запустить трекер", font=("Arial", 10, "bold"), bg="#4CAF50", fg="white", width=22, command=self.toggle_tracker)
        self.btn.pack(pady=10)
        
        self.tray_btn = tk.Button(root, text="Свернуть в трей", font=("Arial", 9), width=22, command=self.hide_to_tray)
        self.tray_btn.pack(pady=2)
        
        self.status_lbl = tk.Label(root, text="Статус: Остановлено", font=("Arial", 9), fg="gray")
        self.status_lbl.pack(pady=5)
        
        # При нажатии на крестик программа не закрывается, а сворачивается в трей
        self.root.protocol("WM_DELETE_WINDOW", self.hide_to_tray)
        
        self.worker_thread = None

    def toggle_tracker(self):
        global tracking_active
        channel = self.entry.get().strip()
        if not channel:
            messagebox.showerror("Ошибка", "Введите ваш ник на Twitch!")
            return
            
        save_config(channel)
        
        if not tracking_active:
            tracking_active = True
            self.btn.config(text="Остановить трекер", bg="#f44336")
            self.entry.config(state="disabled")
            self.status_lbl.config(text="Статус: Поиск музыки...", fg="green")
            
            self.worker_thread = threading.Thread(target=background_worker, args=(channel, self.update_status), daemon=True)
            self.worker_thread.start()
        else:
            tracking_active = False
            self.btn.config(text="Запустить трекер", bg="#4CAF50")
            self.entry.config(state="normal")
            self.status_lbl.config(text="Статус: Остановлено", fg="gray")

    def update_status(self, text):
        self.root.after(0, lambda: self.status_lbl.config(text=text))

    def hide_to_tray(self):
        self.root.withdraw()
        if not self.icon:
            self.setup_tray()

    def setup_tray(self):
        # Создаем значок для трея программно (зеленый квадратик с буквой или точкой)
        image = Image.new('RGB', (64, 64), color=(76, 175, 80))
        d = ImageDraw.Draw(image)
        d.rectangle([16, 16, 48, 48], fill=(255, 255, 255))
        
        menu = pystray.Menu(
            pystray.MenuItem("Открыть", self.show_window),
            pystray.MenuItem("Выход", self.quit_app)
        )
        self.icon = pystray.Icon("AVETRACKER", image, "AVETRACKER", menu)
        threading.Thread(target=self.icon.run, daemon=True).start()

    def show_window(self, icon, item):
        if self.icon:
            self.icon.stop()
            self.icon = None
        self.root.after(0, self.root.deiconify)

    def quit_app(self, icon, item):
        global tracking_active
        tracking_active = False
        if self.icon:
            self.icon.stop()
        self.root.after(0, self.root.destroy)

if __name__ == "__main__":
    root = tk.Tk()
    app = AveTrackerApp(root)
    root.mainloop()