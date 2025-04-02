import struct
import pygame
import time
from socket import *
from threading import Thread


SERVER_IP = '127.0.0.1'
SERVER_PORT = 6501
server_address_port = (SERVER_IP, SERVER_PORT)
SCREEN_SIZE = (800, 600)
PLAYER_SPEED = 5
BULLET_SPEED = 10

class GameClient:
    def __init__(self):
        self.player = {"x": SCREEN_SIZE[0]//2, "y": SCREEN_SIZE[1]//2}
        self.bullets = []
        self.running = True
        self.session_id = None
class Data:
    X_player = 0
    Y_player = 0
    seconds = 0
    start_time = time.time()

class game_loop():
    pygame.init()
    screen = pygame.display.set_mode(SCREEN_SIZE)
    clock = pygame.time.Clock()
    X_player = 0
    Y_player = 0
    game = GameClient()





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
        @staticmethod
        def return_values(send_array):
            game = GameClient()
            send_array [1] = game.player['x']
            send_array [2] = game.player['y']













    pygame.quit()
class DataTransforms:
    @staticmethod
    def update_time(send_array):
        Data.seconds = int(time.time() - Data.start_time)
        send_array[3] = Data.seconds
        return send_array

class Client:
    def __init__(self):
        self.sock = socket(AF_INET, SOCK_DGRAM)
        self.sock.bind(('127.0.0.1', 6502))
        self.sock.setsockopt(SOL_SOCKET, SO_RCVBUF, 65536)  # Увеличиваем буфер
        self.sock.settimeout(2)

    def send_data(self, array):
        try:
            packed_data = struct.pack('10d', *array)  # Явная упаковка 10 значений
            self.sock.sendto(packed_data, server_address_port)
        except error as e:
            print(f"Ошибка отправки: {e}")

    def get_data(self):
        try:
            # Максимальный размер UDP-пакета 65507 байт
            data, _ = self.sock.recvfrom(65507)

            if len(data) != 800:
                print(f"Неверный размер пакета: {len(data)} байт вместо 80")
                return None

            return struct.unpack('100d', data)
        except timeout:
            print("Таймаут ожидания данных")
            return None
        except error as e:
            print(f"Ошибка получения: {e}")
            return None

if __name__ == '__main__':
    try:
        client = Client()
        send_array = [0.0 for _ in range(10)]  # Гарантируем 10 float элементов

        while True:
            get_array = client.get_data()
            if not get_array:
                continue

            send_array = DataTransforms.update_time(send_array)
            send_array = game_loop.return_values(send_array)

            client.send_data(send_array)
            time.sleep(1)

    except KeyboardInterrupt:
        print("Программа завершена пользователем.")
    except Exception as e:
        print(f"Произошла ошибка: {e}")
    finally:
        client.sock.close()
