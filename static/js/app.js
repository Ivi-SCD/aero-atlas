var map = L.map('map').setView([0, 0], 2);
var markerIcon = L.icon({
    iconUrl: '/static/img/marker.png',
    iconSize: [41, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

var layerGroup = L.layerGroup().addTo(map);

var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
});

var satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

var baseMaps = {
    "OpenStreetMap": osmLayer,
    "Satélite": satelliteLayer
};

var categoryMaps = {
    "Agriculture": [
        'Normalized Difference Vegetation Index',
        'Enhanced Vegetation Index',
        'Soil Adjusted Vegetation Index'
    ],
    "Hidrology": [
        'Normalized Difference Water Index',
        'Modified Normalized Difference Water Index',
        'Soil Adjusted Vegetation Index'
    ],
    "Temperature & Climate": [
        'Land Surface Reflection',
        'Brightness'
    ],
}

L.control.layers(baseMaps).addTo(map);

let currentMarker = null;
let currentGrid = [];

map.on('click', function (e) {
    var lat = e.latlng.lat;
    var lng = e.latlng.lng;

    layerGroup.clearLayers();

    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    currentGrid.forEach(grid => map.removeLayer(grid));
    currentGrid = [];

    document.getElementById('lat').value = lat;
    document.getElementById('long').value = lng;

    map.setView(e.latlng, 8);

    currentMarker = L.marker([lat, lng], { icon: markerIcon }).addTo(map);
});

function formatDate(date) {
    if (!date) return null;
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
}

document.getElementById('landsat-form').onsubmit = function (e) {
    e.preventDefault();

    var formData = {
        landsat: document.getElementById('landsat').value,
        level: document.getElementById('level').value,
        lat: document.getElementById('lat').value,
        long: document.getElementById('long').value,
        start_date: formatDate(document.getElementById('start_date').value) || null,
        end_date: formatDate(document.getElementById('end_date').value),
        cloud_cover: document.getElementById('cloud_cover').value || null
    };


    showLoadingIndicator("Carregando cenas...");

    fetch('/get-last-scene/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        hideLoadingIndicator();
        console.log('Cenas recebidas:', data);
        
        var sceneMap = {};
        var sceneSelect = document.createElement('select');
        data.forEach(scene => {
            var option = document.createElement('option');
            option.value = scene.display_id;
            option.textContent = `${scene.Data} - ${scene.Satellite}`;
            
            sceneMap[scene.display_id] = [
                [scene.corner_upper_left_latitude, scene.corner_upper_left_longitude],
                [scene.corner_lower_left_latitude, scene.corner_lower_left_longitude],
                [scene.corner_lower_right_latitude, scene.corner_lower_right_longitude],
                [scene.corner_upper_right_latitude, scene.corner_upper_right_longitude]
            ];
            
            sceneSelect.appendChild(option);
        });

        var downloadButton = document.createElement('button');
        downloadButton.textContent = "Download Your Scene";
        downloadButton.onclick = function () {
            var selectedDisplayId = sceneSelect.value;

            showLoadingIndicator("Baixando cena...");

            var corners = sceneMap[selectedDisplayId];
            downloadScene(selectedDisplayId, corners);
            //displaySceneArea(corners);
        };


        var sceneSelectContainer = document.getElementById('scene-select');
        sceneSelectContainer.innerHTML = "";
        sceneSelectContainer.appendChild(sceneSelect);
        sceneSelectContainer.appendChild(downloadButton);
    })
    .catch((error) => {
        hideLoadingIndicator();
        console.error('Erro:', error);
    });
};

function displaySceneArea(corners) {
    if (!corners || corners.length !== 4) {
        console.error('Corners não estão definidos corretamente:', corners);
        return;
    }

    var polygon = L.polygon(corners, { color: 'blue', fillOpacity: 0.1 }).addTo(map);

    var bounds = polygon.getBounds();
    var latStep = (bounds.getNorth() - bounds.getSouth()) / 3;
    var lngStep = (bounds.getEast() - bounds.getWest()) / 3;

    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            var corner1 = [bounds.getSouth() + i * latStep, bounds.getWest() + j * lngStep];
            var corner2 = [bounds.getSouth() + (i + 1) * latStep, bounds.getWest() + (j + 1) * lngStep];
            var gridSquare = L.rectangle([corner1, corner2], { color: 'red', weight: 1, fillOpacity: 0.2 }).addTo(map);
            currentGrid.push(gridSquare);
        }
    }


    L.imageOverlay('./static/graphs/teste.png', bounds).addTo(map)

}

function downloadScene(display_id, corners) {
    fetch('/download-scene/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'display_id': display_id})
    })
    .then(response => response.json())
    .then(data => {
        hideLoadingIndicator();
        displaySceneArea(corners)
    })
    .catch((error) => {
        hideLoadingIndicator();
        console.error('Erro:', error);
    });
}

function showAgricultureIndicators() {
    const ndviIndicator = document.getElementById('ndvi')
    const ndviCheckboxIndicator = document.getElementById('ndvi-checkbox')
    
    const eviIndicator = document.getElementById('evi')
    const eviCheckboxIndicator = document.getElementById('evi-checkbox')
    
    const saviIndicator = document.getElementById('savi')
    const saviCheckboxIndicator = document.getElementById('savi-checkbox')

    ndviIndicator.style.visibility = 'visible'
    ndviCheckboxIndicator.style.display = 'block'

    eviIndicator.style.visibility = 'visible'
    eviCheckboxIndicator.style.display = 'block'

    saviIndicator.style.visibility = 'visible'
    saviCheckboxIndicator.style.display = 'block'
}

function showHidrologyIndicators() {
    const ndwiIndicator = document.getElementById('ndwi')
    const ndwiCheckboxIndicator = document.getElementById('ndwi-checkbox')
    
    const mndwiIndicator = document.getElementById('mndwi')
    const mndwiCheckboxIndicator = document.getElementById('mndwi-checkbox')

    const aweiIndicator = document.getElementById('awei')
    const aweiCheckboxIndicator = document.getElementById('awei-checkbox')


    ndwiIndicator.style.visibility = 'visible'
    ndwiCheckboxIndicator.style.display = 'block'

    mndwiIndicator.style.visibility = 'visible'
    mndwiCheckboxIndicator.style.display = 'block'

    aweiIndicator.style.visibility = 'visible'
    aweiCheckboxIndicator.style.display = 'block'

}


function showHidrologyIndicators() {
    const lstIndicator = document.getElementById('lst')
    const btiIndicator = document.getElementById('bti')

    lstIndicator.style.display = 'visible'
    btiIndicator.style.display = 'visible'
}



function showLoadingIndicator(message) {
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.textContent = message;
    loadingIndicator.style.display = 'block';
}

function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.style.display = 'none';
}
