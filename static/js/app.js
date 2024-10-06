// Inicialização do Mapa
var map = L.map('map').setView([0, 0], 2);
var markerIcon = L.icon({
    iconUrl: '/static/img/marker.png',
    iconSize: [41, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

var layerGroup = L.layerGroup().addTo(map);
var actualBounds = '';

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

L.control.layers(baseMaps).addTo(map);

let currentMarker = null;
let currentGrid = [];
var currentBounds = '';

let currentOverlay = null;
let indicatorCacheUrls = {};

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
        sceneSelect.id = 'scene-select-dropdown';
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
        downloadButton.type = 'button';
        downloadButton.onclick = function () {
            var selectedDisplayId = sceneSelect.value;
            
            showLoadingIndicator("Baixando cena...");
            
            var corners = sceneMap[selectedDisplayId];
            downloadScene(selectedDisplayId, corners);
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
    
    var polygon = L.polygon(corners, {color: 'blue', fillOpacity: 0 }).addTo(map);
    var bounds = polygon.getBounds();
    currentBounds = bounds;
    var latStep = (bounds.getNorth() - bounds.getSouth()) / 3;
    var lngStep = (bounds.getEast() - bounds.getWest()) / 3;

    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            var corner1 = [bounds.getSouth() + i * latStep, bounds.getWest() + j * lngStep];
            var corner2 = [bounds.getSouth() + (i + 1) * latStep, bounds.getWest() + (j + 1) * lngStep];
            var gridSquare = L.rectangle([corner1, corner2], { color: 'red', weight: 1, fillOpacity: 0 }).addTo(map);
            currentGrid.push(gridSquare);
        }
    }

    var path;

    if (document.getElementById('indicator').value == 'ndvi') {
        path = ndviCacheUrl
    } else {
        path = eviCacheUrl
    }

    L.imageOverlay(path, bounds, {opacity: 1}).addTo(map);


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
        console.log(data);
        currentDisplayId = display_id;
        indicatorCacheUrls = data.graphs;
        hideLoadingIndicator();
        displaySceneArea(corners);
        displayIndicator('ndvi', data.graphs.ndvi);
    })
    .catch((error) => {
        hideLoadingIndicator();
        console.error('Erro:', error);
    });
}

document.getElementById('indicator').addEventListener('change', function(e) {
    updateIndexInfo(e.target.value);
});


updateIndexInfo(document.getElementById('indicator').value);


function displayIndicator(indicator, imageUrl) {
    if (currentOverlay) {
        map.removeLayer(currentOverlay);
    }
    currentOverlay = L.imageOverlay(imageUrl, currentBounds, {opacity: 1}).addTo(map);
    addOpacityControl(currentOverlay);
    updateIndexInfo(indicator);
}

function updateIndexInfo(indicator) {
    const indexInfo = {
        ndvi: {
            title: "NDVI (Índice de Vegetação por Diferença Normalizada)",
            description: "O NDVI mede a saúde e densidade da vegetação. Varia de -1 a 1, onde valores mais altos indicam vegetação mais saudável e densa.",
            interpretation: "• -1 a 0: Água, nuvens, neve ou superfícies não vegetadas\n• 0 a 0.2: Solo exposto ou vegetação muito esparsa\n• 0.2 a 0.4: Vegetação esparsa ou pouco saudável\n• 0.4 a 0.6: Vegetação moderadamente densa e saudável\n• 0.6 a 1: Vegetação muito densa e saudável"
        },
        evi: {
            title: "EVI (Índice de Vegetação Melhorado)",
            description: "O EVI é uma versão aprimorada do NDVI, mais sensível em áreas de alta biomassa e menos influenciado por condições atmosféricas e do solo.",
            interpretation: "• < 0: Água, nuvens, neve ou superfícies não vegetadas\n• 0 a 0.2: Solo exposto ou vegetação muito esparsa\n• 0.2 a 0.4: Vegetação esparsa\n• 0.4 a 0.6: Vegetação moderadamente densa\n• > 0.6: Vegetação muito densa"
        },
        savi: {
            title: "SAVI (Índice de Vegetação Ajustado ao Solo)",
            description: "O SAVI é similar ao NDVI, mas reduz a influência do brilho do solo em áreas com vegetação esparsa.",
            interpretation: "• < 0: Água, nuvens ou neve\n• 0 a 0.1: Solo exposto ou superfícies não vegetadas\n• 0.1 a 0.3: Vegetação esparsa\n• 0.3 a 0.5: Vegetação moderadamente densa\n• > 0.5: Vegetação densa"
        },
        ndwi: {
            title: "NDWI (Índice de Água por Diferença Normalizada)",
            description: "O NDWI é usado para detectar corpos d'água e medir o conteúdo de água na vegetação.",
            interpretation: "• < 0: Vegetação ou solo\n• 0 a 0.2: Vegetação úmida ou solo muito úmido\n• > 0.2: Corpos d'água abertos"
        },
        mndwi: {
            title: "MNDWI (Índice de Água por Diferença Normalizada Modificado)",
            description: "O MNDWI é uma versão melhorada do NDWI, mais eficaz na detecção de água em áreas urbanas.",
            interpretation: "• < 0: Vegetação, solo ou áreas construídas\n• 0 a 0.2: Áreas mistas (possível presença de água)\n• > 0.2: Corpos d'água abertos"
        },
        awei: {
            title: "AWEI (Índice de Extração de Água Automatizado)",
            description: "O AWEI é projetado para separar efetivamente superfícies de água de outras superfícies terrestres em imagens de satélite.",
            interpretation: "• < 0: Não-água (vegetação, solo, áreas urbanas)\n• > 0: Água (quanto maior o valor, maior a probabilidade de ser água)"
        }
    };

    const info = indexInfo[indicator];
    const infoHtml = `
        <h3>${info.title}</h3>
        <p>${info.description}</p>
        <h4>Interpretação:</h4>
        <pre>${info.interpretation}</pre>
    `;
    
    document.getElementById('index-info').innerHTML = infoHtml;
}

function indicator() {
    var selectedIndicator = document.getElementById('indicator').value;

    if (currentOverlay) {
        map.removeLayer(currentOverlay);
    }

    if (indicatorCacheUrls[selectedIndicator]) {
        displayIndicator(selectedIndicator, indicatorCacheUrls[selectedIndicator]);
    } else {
        showLoadingIndicator("Calculando índice...");
        fetch('/calculate-indicator/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                'display_id': currentDisplayId,
                'indicator': selectedIndicator
            })
        })
        .then(response => response.json())
        .then(data => {
            hideLoadingIndicator();
            indicatorCacheUrls[selectedIndicator] = data.image_url;
            displayIndicator(selectedIndicator, data.image_url);
        })
        .catch((error) => {
            hideLoadingIndicator();
            console.error('Erro:', error);
        });
    }
}

function formatDate(date) {
    if (!date) return null;
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
}

function showAgricultureIndicators() {
    const agricultureIndicators = ['ndvi', 'evi', 'savi'];
    agricultureIndicators.forEach(id => {
        document.getElementById(id).style.display = 'block';
        document.getElementById(`${id}-checkbox`).style.visibility = 'visible';
    });
}

function showHidrologyIndicators() {
    const hidrologyIndicators = ['ndwi', 'mndwi', 'awei'];
    hidrologyIndicators.forEach(id => {
        document.getElementById(id).style.display = 'block';
        document.getElementById(`${id}-checkbox`).style.visibility = 'visible';
    });
}

function hideAllIndicators() {
    const indicators = ['ndvi', 'evi', 'savi', 'ndwi', 'mndwi', 'awei', 'lsr', 'bt'];
    indicators.forEach(id => {
        const element = document.getElementById(id);
        const checkbox = document.getElementById(`${id}-checkbox`);
        if(element) element.style.display = 'none';
        if(checkbox) checkbox.style.visibility = 'hidden';
    });

    if (currentOverlay) {
        map.removeLayer(currentOverlay);
        currentOverlay = null;
    }
}


function updateInfo() {
    const selectedValue = document.getElementById('category-select').value;
    console.log(`Categoria selecionada: ${selectedValue}`);

    hideAllIndicators();

    switch (selectedValue) {
        case 'All':
            showAgricultureIndicators();
            showHidrologyIndicators();
            break;
        case 'Agriculture':
            showAgricultureIndicators();
            break;
        case 'Hidrology':
            showHidrologyIndicators();
            break;
        default:
            console.log('Categoria não reconhecida');
    }
}

document.getElementById('category-select').addEventListener('change', updateInfo);
document.getElementById('indicator').addEventListener('change', indicator);

hideAllIndicators();

function showLoadingIndicator(message) {
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.textContent = message;
    loadingIndicator.style.display = 'block';
}

function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.style.display = 'none';
}

document.getElementById('home-link').addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('principal').style.display = 'flex';
    document.getElementById('analysis-container').style.display = 'none';
});

document.getElementById('analysis-link').addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('principal').style.display = 'none';
    document.getElementById('analysis-container').style.display = 'block';
});

document.getElementById('registration-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    data.preferences = formData.getAll('preferences');
    data.indicators = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.id.replace('-checkbox', ''));
    
    fetch('/register/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
    })
    .catch(error => {
        console.error('Error:', error);
    });
});

window.addEventListener('beforeunload', function() {
    fetch('/cleanup/', {
        method: 'POST'
    });
});