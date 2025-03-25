import struct
import time
from socket import *

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

if __name__ == '__main__':
    try:
        client = Client()
        send_array = [0.0 for _ in range(10)]  # Гарантируем 10 float элементов

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
