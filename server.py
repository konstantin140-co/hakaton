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
