from flask import Flask, jsonify, request, render_template
from service import get_scenes, \
get_metadata_scenes, download_scene, calculate_and_plot_indices
from cachetools import TTLCache
from functools import lru_cache
from datetime import datetime, timedelta
import os

api_cache = TTLCache(maxsize=100, ttl=3600)
index_cache = TTLCache(maxsize=50, ttl=7200)

app = Flask(__name__, template_folder='./templates', static_folder='./static')

def get_scenes_with_cache(landsat, level, lat, long, end_date, start_date=None, cloud_cover=None):
    cache_key = f"{landsat}_{level}_{lat}_{long}_{end_date}_{start_date}_{cloud_cover}"
    if cache_key in api_cache:
        return api_cache[cache_key]
    
    scenes = get_scenes(landsat, level, lat, long, end_date, start_date, cloud_cover)
    api_cache[cache_key] = scenes
    return scenes

@lru_cache(maxsize=32)
def calculate_and_plot_indices_with_cache(display_id):
    if display_id in index_cache:
        return index_cache[display_id]
    
    indices = calculate_and_plot_indices(display_id)
    index_cache[display_id] = indices
    return indices

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analysis')
def analysis():
    return render_template('analysis.html')

@app.route("/get-last-scene/", methods=['POST'])
def get_last_scenes():
    data = request.get_json()
    latitude = float(data['lat'])
    longitude = float(data['long'])
    landsat = data['landsat']
    start_date = data['start_date']
    end_date = data['end_date']
    level = int(data['level'])
    cloud_cover = data['cloud_cover']
    
    scenes = get_scenes_with_cache(landsat, level, latitude, longitude, end_date, start_date, cloud_cover)
    
    returned_scenes = []
    for scene in scenes:
        metadata = get_metadata_scenes(scene['display_id'])
        metadata['display_id'] = scene['display_id']
        metadata['corner_upper_left_latitude'] = scene['corner_upper_left_latitude']
        metadata['corner_upper_left_longitude'] = scene['corner_upper_left_longitude']
        metadata['corner_lower_left_latitude'] = scene['corner_lower_left_latitude']
        metadata['corner_lower_left_longitude'] = scene['corner_lower_left_longitude']
        metadata['corner_lower_right_latitude'] = scene['corner_lower_right_latitude']
        metadata['corner_lower_right_longitude'] = scene['corner_lower_right_longitude']
        metadata['corner_upper_right_latitude'] = scene['corner_upper_right_latitude']
        metadata['corner_upper_right_longitude'] = scene['corner_upper_right_longitude']
        returned_scenes.append(metadata)
    
    
    return jsonify(returned_scenes)


@app.route("/download-scene/", methods=['POST'])
def download_scene_by_display_id():
    data = request.get_json()
    display_id = data['display_id']

    
    download_scene(display_id)
    graphs = calculate_and_plot_indices_with_cache(display_id)
    
    return jsonify({'msg': 'OK', 'graphs': graphs})

if __name__ == '__main__':
    app.run(debug=True)

@app.route('/register/', methods=['POST'])
def register():
    data = request.get_json()
    # Here you would typically save this data to a database
    # For this example, we'll just print it and return a success message
    print(data)
    
    # Calculate next satellite pass
    last_scene_date = datetime.strptime(data['last_scene_date'], '%Y-%m-%d')
    next_pass_date = last_scene_date + timedelta(days=16)
    
    # Here you would typically send an email with the selected indicators and info
    # For this example, we'll just return a success message
    return jsonify({
        'message': f'Registro bem-sucedido! O próximo satélite passará em {next_pass_date.strftime("%Y-%m-%d")}.'
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)