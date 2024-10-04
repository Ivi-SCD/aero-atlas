from flask import Flask, jsonify, request, render_template
from service import get_scenes, \
get_metadata_scenes, download_scene, calculate_and_plot_indices

app = Flask(__name__, template_folder='./templates', static_folder='./static')

@app.route('/')
def index():
    return render_template('index.html')

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
    
    scenes = get_scenes(landsat, level, latitude, longitude, end_date, start_date, cloud_cover)
    
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
    graphs = calculate_and_plot_indices(display_id)
    
    return jsonify({'msg': 'OK', 'graphs': graphs})

if __name__ == '__main__':
    app.run(debug=True)
