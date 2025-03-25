import struct
import time
import threading
import pygame
import random
from socket import *

# Настройки игры
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
PLAYER_SPEED = 5
BULLET_SPEED = 10

# Сетевые настройки
SERV_IP = "127.0.0.1"
SERV_PORT = 6501
serv = (SERV_IP, SERV_PORT)

def find_available_port(start_port=6502, max_port=6510):
    for port in range(start_port, max_port + 1):
        try:
            sock = socket(family=AF_INET, type=SOCK_DGRAM)
            sock.bind(('127.0.0.1', port))
            sock.close()
            return port
        except OSError:
            continue
    raise RuntimeError(f"Could not find an available port between {start_port} and {max_port}")

class GameData:
    def __init__(self):
        self.player_x = SCREEN_WIDTH // 2
        self.player_y = SCREEN_HEIGHT // 2
        self.bullets = []
        self.enemies = []

    def add_bullet(self, x, y):
        if len(self.bullets) < 8:
            self.bullets.append({"x": x, "y": y})

class NetworkManager:
    def __init__(self, game_data):
        self.game_data = game_data
        self.client_port = find_available_port()
        self.sock = socket(family=AF_INET, type=SOCK_DGRAM)
        self.sock.bind(('127.0.0.1', self.client_port))
        self.sock.settimeout(0.01)  # Таймаут для предотвращения блокировки
        print(f"Network started on port {self.client_port}")

    def send_data(self):
        bullets_x = [b['x'] for b in self.game_data.bullets[:8]]
        bullets_x += [0.0] * (8 - len(bullets_x))

        data_to_send = [
            float(self.game_data.player_x),
            float(self.game_data.player_y),
            *bullets_x
        ]

        try:
            data = struct.pack('10d', *data_to_send)
            self.sock.sendto(data, serv)
        except struct.error as e:
            print(f"Packing error: {e}")

    def receive_data(self):
        try:
            data, _ = self.sock.recvfrom(1024)
            if len(data) != 80:  # 10 double × 8 bytes
                print(f"Invalid data size: {len(data)} bytes")
                return [0.0] * 10
            return struct.unpack('10d', data)
        except (BlockingIOError, timeout):
            return [0.0] * 10
        except struct.error as e:
            print(f"Unpack error: {e}")
            return [0.0] * 10
        except OSError as e:
            print(f"Network error: {e}")
            return [0.0] * 10

def game_loop(game_data, net_manager):
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    clock = pygame.time.Clock()
    running = True

    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        keys = pygame.key.get_pressed()
        if keys[pygame.K_w]: game_data.player_y -= PLAYER_SPEED
        if keys[pygame.K_s]: game_data.player_y += PLAYER_SPEED
        if keys[pygame.K_a]: game_data.player_x -= PLAYER_SPEED
        if keys[pygame.K_d]: game_data.player_x += PLAYER_SPEED

        if keys[pygame.K_SPACE]:
            game_data.add_bullet(game_data.player_x, game_data.player_y)

        # Обновление пуль
        game_data.bullets = [b for b in game_data.bullets if b['y'] > 0]
        for bullet in game_data.bullets:
            bullet['y'] -= BULLET_SPEED

        # Сетевое взаимодействие
        net_manager.send_data()
        received = net_manager.receive_data()

        # Отрисовка
        screen.fill((0, 0, 0))

        # Игрок
        pygame.draw.circle(screen, (0, 255, 0),
            (int(game_data.player_x), int(game_data.player_y)), 15)

        # Пули
        for bullet in game_data.bullets:
            pygame.draw.rect(screen, (255, 0, 0),
                (bullet['x'], bullet['y'], 5, 10))

        # Враги (первые 2 значения - координаты другого игрока)
        if received[0] != 0.0 or received[1] != 0.0:
            pygame.draw.rect(screen, (0, 0, 255),
                (received[0], received[1], 30, 30))

        pygame.display.flip()
        clock.tick(30)

    pygame.quit()

if __name__ == '__main__':
    game_data = GameData()
    net_manager = NetworkManager(game_data)

    game_thread = threading.Thread(
        target=game_loop,
        args=(game_data, net_manager)
    )
    game_thread.start()
    game_thread.join()
