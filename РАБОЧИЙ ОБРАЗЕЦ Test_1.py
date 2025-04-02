import struct
import pygame
import requests
import time
from socket import *
from threading import Thread

SCREEN_SIZE = (1000, 1000)
PLAYER_SPEED = 5
BULLET_SPEED = 10
SERVER_IP = '127.0.0.1'
SERVER_PORT = 6501
server_address_port = (SERVER_IP, SERVER_PORT)

class Data:
    value = 0.0
    seconds = 0
    start_time = time.time()

class DataTransforms:
    @staticmethod
    def update_value(send_array):
        Data.value += 0.5
        send_array[2] = Data.value
        return send_array

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
                f"{SERVER_IP}/session",
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
                    f"{SERVER_IP}/update",
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
        pygame.draw.circle(screen, (0,255,0),(game.player['x'], game.player['y']), 15)
        for bullet in game.bullets:
            pygame.draw.rect(screen, (255,0,0),(bullet['x'], bullet['y'], 5, 10))

        pygame.display.flip()
        clock.tick(30)

    pygame.quit()

if __name__ == '__main__':
    try:
        client = Client()
        send_array = [0.0 for _ in range(10)] # Гарантируем 10 float элементов
        game_loop()

        while True:
            get_array = client.get_data()
            if not get_array:
                continue

            send_array = DataTransforms.update_value(send_array)
            send_array = DataTransforms.update_time(send_array)

            client.send_data(send_array)
            time.sleep(1)

    except KeyboardInterrupt:
        print("Программа завершена пользователем.")
    except Exception as e:
        print(f"Произошла ошибка: {e}")
    finally:
        client.sock.close()
