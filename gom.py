# ------------ game.py (Игровой клиент) ------------
import pygame
import requests
import time
from threading import Thread

# Настройки игры
SCREEN_SIZE = (800, 600)
PLAYER_SPEED = 5
BULLET_SPEED = 10
SERVER_URL = "http://localhost:5000"

class GameClient:
    def __init__(self):
        self.player = {"x": SCREEN_SIZE[0]//2, "y": SCREEN_SIZE[1]//2}
        self.bullets = []
        self.running = True
        self.session_id = None

    def connect_to_vrconcept(self):
        """Регистрация сессии в VRconcept"""
        try:
            response = requests.post(
                f"{SERVER_URL}/session",
                json={"scene": "doom_demo"}
            )
            self.session_id = response.json()['session_id']
        except Exception as e:
            print(f"Connection error: {e}")

    def send_update(self):
        """Отправка данных на сервер"""
        while self.running:
            data = {
                "session_id": self.session_id,
                "player": self.player,
                "bullets": self.bullets
            }
            try:
                requests.post(
                    f"{SERVER_URL}/update",
                    json=data,
                    timeout=1
                )
            except Exception as e:
                print(f"Update failed: {e}")
            time.sleep(0.1)

def game_loop():
    pygame.init()
    screen = pygame.display.set_mode(SCREEN_SIZE)
    clock = pygame.time.Clock()

    game = GameClient()
    game.connect_to_vrconcept()

    # Запуск потока для отправки данных
    sender = Thread(target=game.send_update)
    sender.start()

    while game.running:
        # Обработка событий
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                game.running = False

        # Управление
        keys = pygame.key.get_pressed()
        if keys[pygame.K_w]: game.player['y'] -= PLAYER_SPEED
        if keys[pygame.K_s]: game.player['y'] += PLAYER_SPEED
        if keys[pygame.K_a]: game.player['x'] -= PLAYER_SPEED
        if keys[pygame.K_d]: game.player['x'] += PLAYER_SPEED

        if keys[pygame.K_SPACE]:
            game.bullets.append({
                "x": game.player['x'],
                "y": game.player['y']
            })

        # Обновление пуль
        game.bullets = [b for b in game.bullets if b['y'] > 0]
        for bullet in game.bullets:
            bullet['y'] -= BULLET_SPEED

        # Отрисовка
        screen.fill((0,0,0))
        pygame.draw.circle(screen, (0,255,0),
            (game.player['x'], game.player['y']), 15)
        for bullet in game.bullets:
            pygame.draw.rect(screen, (255,0,0),
                (bullet['x'], bullet['y'], 5, 10))

        pygame.display.flip()
        clock.tick(30)

    pygame.quit()

if __name__ == "__main__":
    game_loop()

# ------------ server.py (Сервер-посредник) ------------
from flask import Flask, request, jsonify
import requests
import uuid

app = Flask(__name__)

# Конфигурация VRconcept API (пример)
VRC_API = {
    "base_url": "https://api.vrconcept.com/v1",
    "auth": {"api_key": "YOUR_API_KEY"},
    "endpoints": {
        "create_object": "/objects",
        "update_object": "/objects/{id}"
    }
}

# Активные сессии
sessions = {}

def vrconcept_api_call(method, endpoint, data=None):
    """Вызов API VRconcept"""
    url = f"{VRC_API['base_url']}{endpoint}"
    headers = {"Authorization": f"Bearer {VRC_API['auth']['api_key']}"}

    try:
        response = requests.request(
            method=method,
            url=url,
            json=data,
            headers=headers,
            timeout=2
        )
        return response.json()
    except Exception as e:
        print(f"VRconcept API Error: {e}")
        return None

@app.route('/session', methods=['POST'])
def create_session():
    """Создание новой VR-сессии"""
    session_id = str(uuid.uuid4())

    # Создание сцены в VRconcept
    scene_data = {
        "name": request.json.get('scene', 'default'),
        "objects": [
            {"type": "player", "id": "player"},
            {"type": "bullet", "id": "bullet_template"}
        ]
    }

    vr_response = vrconcept_api_call(
        "POST",
        "/scenes",
        scene_data
    )

    if vr_response:
        sessions[session_id] = {
            "vr_scene_id": vr_response['id'],
            "objects": {}
        }
        return jsonify({"session_id": session_id})
    else:
        return jsonify({"error": "VR scene creation failed"}), 500

@app.route('/update', methods=['POST'])
def handle_update():
    """Обработка обновлений из игры"""
    data = request.json
    session = sessions.get(data['session_id'])

    if not session:
        return jsonify({"error": "Invalid session"}), 404

    # Обновление игрока
    vrconcept_api_call(
        "PATCH",
        f"/objects/player",
        {
            "position": [
                data['player']['x'],
                data['player']['y'],
                0  # Z-координата для VR
            ]
        }
    )

    # Обновление пуль
    for i, bullet in enumerate(data['bullets']):
        bullet_id = f"bullet_{i}"
        if bullet_id not in session['objects']:
            vrconcept_api_call(
                "POST",
                "/objects",
                {
                    "type": "bullet",
                    "position": [
                        bullet['x'],
                        bullet['y'],
                        0
                    ],
                    "parent_scene": session['vr_scene_id']
                }
            )
            session['objects'][bullet_id] = True

    return jsonify({"status": "success"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
