import struct
import time
from socket import *

SERV_IP = "127.0.0.1"
SERV_PORT = 6501
serv = (SERV_IP,SERV_PORT)

class Data:
    value = 0.0
    sec = 0
    start_time = time.time()

class DataTransforms:
    @staticmethod
    def update_value(send_array):
        Data.value += 0.5
        send_array[2] = Data.value
        return send_array

    @staticmethod
    def update_time(send_array):
        Data.sec = int(time.time() - Data.start_time)
        send_array[3] = Data.sec
        return send_array

class Client:
    @staticmethod
    def send_data(array):
        UDPClientSocet = socket(family = AF_INET, type = SOCK_DGRAM)
        bts =[struct.pack('d',f) for f in array]
        UDPClientSocet.sendto(b''.join(bts), serv)

    @staticmethod
    def get_data(UDPClientSocet):
        buffer_size = 1024
        conn = UDPClientSocet.recvfrom(buffer_size)
        array = struct.unpack('10d', conn)
        return array

if __name__ == '__main__':
    try:
        UDPClientSocket = socket(family = AF_INET, type = SOCK_DGRAM)
        UDPClientSocket.bind(('127.0.0.1', 6502))
        client = Client()
        send_array = [0 for _ in range(10)]

        while True:
            get_array = client.get_data(UDPClientSocket)

            send_array = DataTransforms.update_value(send_array)
            send_array = DataTransforms.update_time(send_array)

            client.send_data(send_array)

            time.sleep(1)
    except KeyboardInterrupt:
        print("THE END")
    except Exception as e:
        print("ERROR: ", e)
    finally:
        UDPClientSocket.close()

































