from landsatxplore.api import API
from landsatxplore.earthexplorer import EarthExplorer
import rasterio
from rembg import remove
from PIL import Image
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import tarfile
import os
from dotenv import load_dotenv

load_dotenv()
USERNAME = os.getenv('USERNAME_USGS')
PASSWORD = os.getenv('PASSWORD')

api = API(username=USERNAME, password=PASSWORD)


def get_scenes(landsat, level, lat, long, end_date, start_date=None, cloud_cover=None, recent=False) -> list:
        start_date_func, end_date_func = __define_periodo(end_date, start_date)
        scenes = api.search(
            dataset = __get_landsat(landsat, level),
            latitude=lat,
            longitude=long,
            start_date=str(start_date_func),
            end_date=str(end_date_func),
            max_cloud_cover=cloud_cover
        )

        if(landsat == 'L8'):
            scenes = filter(lambda scene: (scene['display_id'].startswith('LC08')), scenes)
        if(landsat == 'L9'):
            scenes = filter(lambda scene: (scene['display_id'].startswith('LC09')), scenes)


        if recent == True:
            return scenes[0]
        return scenes


def get_corners_from_scene(scene):
    return {
        'scene_id': scene['scene_id'],
        'corner_upper_left_latitude': scene['corner_upper_left_latitude'],
        'corner_upper_left_longitude': scene['corner_upper_left_longitude'],
        'corner_lower_left_latitude': scene['corner_lower_left_latitude'],
        'corner_lower_left_longitude': scene['corner_lower_left_longitude'],
        'corner_lower_right_latitude': scene['corner_lower_right_latitude'],
        'corner_lower_right_longitude': scene['corner_lower_right_longitude'],
        'corner_upper_right_latitude': scene['corner_upper_right_latitude'],
        'corner_upper_right_longitude': scene['corner_upper_right_longitude']
    }



def calculate_and_plot_indices(display_id):
    """Calcula NDVI, EVI, SAVI, NDWI, MNDWI, AWEI e salva os gráficos como imagens."""
    scene_path = f'./data/{display_id}'
    indices = {}

    with rasterio.open(f'{scene_path}/{display_id}_B2.TIF') as blue, \
         rasterio.open(f'{scene_path}/{display_id}_B3.TIF') as green, \
         rasterio.open(f'{scene_path}/{display_id}_B4.TIF') as red, \
         rasterio.open(f'{scene_path}/{display_id}_B5.TIF') as nir, \
         rasterio.open(f'{scene_path}/{display_id}_B6.TIF') as swir1, \
         rasterio.open(f'{scene_path}/{display_id}_B7.TIF') as swir2:
        
        blue_band = blue.read(1).astype(float)
        green_band = green.read(1).astype(float)
        red_band = red.read(1).astype(float)
        nir_band = nir.read(1).astype(float)
        swir1_band = swir1.read(1).astype(float)
        swir2_band = swir2.read(1).astype(float)

        # NDVI
        ndvi = (nir_band - red_band) / (nir_band + red_band)
        indices['ndvi'] = plot_and_save_index(ndvi, 'NDVI', display_id, vmin=-1, vmax=1, 
                                              cmap=LinearSegmentedColormap.from_list("", ['#FFFFE0', '#00A600']))

        # EVI
        evi = 2.5 * ((nir_band - red_band) / (nir_band + 6 * red_band - 7.5 * blue_band + 1))
        indices['evi'] = plot_and_save_index(evi, 'EVI', display_id, vmin=-1, vmax=1, 
                                             cmap=LinearSegmentedColormap.from_list("", ['#FFFACD', '#006400']))

        # SAVI
        L = 0.5
        savi = ((nir_band - red_band) / (nir_band + red_band + L)) * (1 + L)
        indices['savi'] = plot_and_save_index(savi, 'SAVI', display_id, vmin=-1, vmax=1, 
                                              cmap=LinearSegmentedColormap.from_list("", ['#FFB6C1', '#228B22']))

        # NDWI
        ndwi = (green_band - nir_band) / (green_band + nir_band)
        indices['ndwi'] = plot_and_save_index(ndwi, 'NDWI', display_id, vmin=-1, vmax=1, 
                                              cmap='RdYlBu')

        # MNDWI
        mndwi = (green_band - swir1_band) / (green_band + swir1_band)
        indices['mndwi'] = plot_and_save_index(mndwi, 'MNDWI', display_id, vmin=-1, vmax=1, 
                                               cmap='coolwarm')

        # AWEI
        awei = 4 * (green_band - swir1_band) - (0.25 * nir_band + 2.75 * swir2_band)
        indices['awei'] = plot_and_save_index(awei, 'AWEI', display_id, 
                                              vmin=np.percentile(awei, 2), vmax=np.percentile(awei, 98), 
                                              cmap='viridis')

    return indices

def plot_and_save_index(index, index_name, display_id, vmin, vmax, cmap):
    plt.figure(figsize=(8, 8))
    plt.imshow(index, cmap=cmap, vmin=vmin, vmax=vmax)
    plt.colorbar(label=index_name)
    plt.title(index_name)
    plt.axis('off')
    save_path = f'static/graphs/{display_id}_{index_name.lower()}.png'
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()

    img = Image.open(save_path)
    img = remove(img)
    img.save(save_path)

    return f'/static/graphs/{display_id}_{index_name.lower()}.png'

    
def download_scene(display_id):
    ee = EarthExplorer(USERNAME, PASSWORD)

    try:
        ee.download(display_id, output_dir='./data')

        if os.path.isfile(f'./data/{display_id}.tar'):
            with tarfile.open(f'./data/{display_id}.tar') as tar:
                tar.extractall(path=f'./data/{display_id}') 
                print(f'{display_id} successfully downloaded and extracted.')

            metadata = get_metadata_scenes(display_id)
            return metadata

    except Exception as e:
        if os.path.isfile(f'./data/{display_id}.tar'):
            print(f'{display_id} error but file exists: {str(e)}')
        else:
            print(f'{display_id} download failed: {str(e)}')


def get_metadata_scenes(display_id):
    metadata = display_id.split('_')
    original_data = metadata[3]
    formatted_data = datetime.strptime(original_data, '%Y%m%d').strftime('%Y-%m-%d')
    
    return {
            'Satellite': metadata[0],
            'Processing_Level': metadata[1],
            'Data': formatted_data,
            'WSR2_Column': metadata[2][:3],
            'WSR2_Row': metadata[2][3:],
            'Collection': metadata[4], 
            'Category': metadata[5]
        }


def __define_periodo(end_date, start_date) -> dict:
    if isinstance(end_date, str):
        end_date = datetime.strptime(end_date, '%Y-%m-%d')
    
    if start_date is None:
        start_date = end_date - timedelta(days=16)
    else:
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, '%Y-%m-%d')
    
    return start_date, end_date


def __get_landsat(landsat, level):
    if landsat in ['L9', 'L8']:
        if level == 1:
            return 'landsat_ot_c2_l1'
        elif level == 2:
            return 'landsat_ot_c2_l2'
        raise 'Level not found, specify between 1 - 2'
    
    elif landsat == 'L7':
        if level == 1:
            return 'landsat_etm_c2_l1'
        elif level == 2:
            return 'landsat_etm_c2_l2'
        raise 'Level not found, specify between 1 - 2'
    
    elif landsat == 'L5':
        if level == 1:
            return 'landsat_tm_c2_l1'
        elif level == 2:
            return 'landsat_tm_c2_l2'
        raise 'Level not found, specify between 1 - 2'
    
    else:
        raise 'Landsat Not Found. Please select one of [L5, L7, L8, L9]'
    

if __name__ == '__main__':
    print(':)')