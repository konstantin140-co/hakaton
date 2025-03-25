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
