import struct
import time
from socket import *

SERV_IP = "127.0.0.1"
SERV_PORT = 6501
serv = (SERV_IP, SERV_PORT)

def find_available_port(start_port=6501, max_port=6510):
    for port in range(start_port, max_port + 1):
        try:
            sock = socket(family=AF_INET, type=SOCK_DGRAM)
            sock.bind(('127.0.0.1', port))
            sock.close()
            return port
        except OSError:
            continue
    raise RuntimeError(f"Could not find an available port between {start_port} and {max_port}")

class Data:
    def __init__(self):
        self.value = 0.0
        self.sec = 0
        self.start_time = time.time()

class DataTransforms:
    @staticmethod
    def update_value(data, send_array):
        data.value += 0.5
        send_array[1] = data.value
        return send_array

    @staticmethod
    def update_time(data, send_array):
        data.sec = int(time.time() - data.start_time)
        send_array[3] = data.sec
        return send_array

class Client:
    @staticmethod
    def send_data(array, serv):
        UDPClientSocket = socket(family=AF_INET, type=SOCK_DGRAM)
        bts = struct.pack('10d', *array)
        UDPClientSocket.sendto(bts, serv)
        UDPClientSocket.close()

    @staticmethod
    def get_data(UDPClientSocket):
        buffer_size = 1024
        conn, _ = UDPClientSocket.recvfrom(buffer_size)
        array = struct.unpack('10d', conn)
        return array

if __name__ == '__main__':
    UDPClientSocket = None
    try:
        data = Data()
        # Find an available port
        client_port = find_available_port()
        print(f"Using port: {client_port}")
        
        UDPClientSocket = socket(family=AF_INET, type=SOCK_DGRAM)
        UDPClientSocket.bind(('127.0.0.1', client_port))
        client = Client()
        send_array = [0.0 for _ in range(10)]

        while True:
            get_array = client.get_data(UDPClientSocket)
            print(f"Received: {get_array}")

            send_array = DataTransforms.update_value(data, send_array)
            send_array = DataTransforms.update_time(data, send_array)

            client.send_data(send_array, serv)
            print(f"Sent: {send_array}")

            time.sleep(1)
    except KeyboardInterrupt:
        print("THE END")
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        if UDPClientSocket:
            UDPClientSocket.close()
